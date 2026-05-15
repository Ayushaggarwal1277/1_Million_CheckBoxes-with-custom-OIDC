import http from 'node:http';

import express from 'express';
import dotenv from 'dotenv';
import {Server} from 'socket.io';
import {publisher,subscriber,redis} from './redis-connection.js';
import * as jose from "jose";
import { publicKey } from "./keys.js";

import oidcRoutes from './routes/oidc.routes.js'

dotenv.config({path:'./.env',quiet:true});

const CHECKBOX_COUNT = 100000;
const REDIS_KEY = 'checkbox-state-v2';
// const RateLimitingHashMap = new Map();
// const state = {
//     checkboxes : new Array(CHECKBOX_COUNT).fill(false),
// }

subscriber.subscribe('in-memory-db:checkboxClicked');


async function main(){

    const PORT = process.env.PORT || 8000;

    const app = express();
    const server = http.createServer(app);

    const io = new Server();
    io.attach(server);

    app.use(express.static('public'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));


    subscriber.on('message',(channel,data) => {

        if(channel === 'in-memory-db:checkboxClicked'){
            const {index,value} = JSON.parse(data);
            // state.checkboxes[index] = value;
            io.emit('server:checkbox-state',JSON.parse(data));
        }

    })

    const parseCookies = (cookieHeader = "") => {
        return cookieHeader
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .reduce((acc, part) => {
                const [key, ...rest] = part.split("=");
                acc[key] = decodeURIComponent(rest.join("="));
                return acc;
            }, {});
    };

    const getUserFromCookie = async (cookieHeader, hostHeader = "") => {
        const cookies = parseCookies(cookieHeader);
        const port = hostHeader.split(":")[1] || "80";
        const token = cookies[`mc_token_${port}`];
        if (!token) return null;

        try {
            const { payload } = await jose.jwtVerify(token, publicKey);
            return payload?.email ? { email: payload.email } : null;
        } catch (error) {
            return null;
        }
    };

    io.on('connection',async (socket) => {
        console.log(`Socket with socket id ${socket.id} is connected`);

        socket.on('client:checkboxClicked',async (data) => {
            const user = await getUserFromCookie(
                socket.handshake.headers.cookie,
                socket.handshake.headers.host || ""
            );
            if (!user) {
                socket.emit('rate-limiting-error', {error:"Please sign in to continue."});
                return;
            }
            
            console.log('data received',data);
            //io.emit('server:checkbox-state',data);

            const rateKey = user.email;
            const lastOperationTime = await redis.get(rateKey);
            if(lastOperationTime){

                if(Date.now() - lastOperationTime < 5*1000){ //5sec
                    
                    socket.emit('rate-limiting-error', {error:"Please wait"});
                    return;

                } 

            }
            await redis.set(rateKey,Date.now());


            const existingKey = await redis.get(REDIS_KEY);
            if(existingKey){
                const existingData = JSON.parse(existingKey);
                existingData[data.index] = data.value;
                await redis.set(REDIS_KEY,JSON.stringify(existingData));
            }
            else{
                await redis.set(REDIS_KEY,JSON.stringify(new Array(CHECKBOX_COUNT).fill(false)));
            }
            publisher.publish('in-memory-db:checkboxClicked',JSON.stringify(data));
            //state.checkboxes[data.index] = data.value;
        })
        
    })

    app.get('/checkboxes',async (req,res) => {
        const user = await getUserFromCookie(req.headers.cookie, req.headers.host || "");
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const existingState = await redis.get(REDIS_KEY);
        if(!existingState) await redis.set(REDIS_KEY,JSON.stringify(new Array(CHECKBOX_COUNT).fill(false)));

        res.json({checkboxes : JSON.parse(await redis.get(REDIS_KEY))});
    })

    app.get('/.well-known/openid-configuration', (req,res) => {

        const ISSUER = 'http://localhost:8000/oidc';
        return res.json({
            issuer: `${ISSUER}`,
            authorization_endpoint: `${ISSUER}/o/v1/auth`,
            token_endpoint: `${ISSUER}/token`,
            jwks_uri: `${ISSUER}/o/key`,
            user_info_endpoint: `${ISSUER}/o/userinfo`,
        })

    })

    server.listen(PORT,(req,res) => {
        console.log(`Server is running on ${PORT}`);
    })

    app.use('/oidc',oidcRoutes);


}

main();


