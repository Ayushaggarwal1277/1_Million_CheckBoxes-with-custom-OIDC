import http from 'node:http';

import express from 'express';
import dotenv from 'dotenv';
import {Server} from 'socket.io';
import {publisher,subscriber,redis} from './redis-connection.js';

dotenv.config({path:'./.env',quiet:true});

const CHECKBOX_COUNT = 10000 
const REDIS_KEY = 'checkbox-state'
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


    subscriber.on('message',(channel,data) => {

        if(channel === 'in-memory-db:checkboxClicked'){
            const {index,value} = JSON.parse(data);
            // state.checkboxes[index] = value;
            io.emit('server:checkbox-state',JSON.parse(data));
        }

    })

    io.on('connection',async (socket) => {
        console.log(`Socket with socket id ${socket.id} is connected`);

        socket.on('client:checkboxClicked',async (data) => {
            
            console.log('data received',data);
            //io.emit('server:checkbox-state',data);
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
        const existingState = await redis.get(REDIS_KEY);
        if(!existingState) await redis.set(REDIS_KEY,JSON.stringify(new Array(CHECKBOX_COUNT).fill(false)));

        res.json({checkboxes : JSON.parse(await redis.get(REDIS_KEY))});
    })

    server.listen(PORT,(req,res) => {
        console.log(`Server is running on ${PORT}`);
    })


}

main();
