import http from 'node:http';

import express from 'express';
import dotenv from 'dotenv';
import {Server} from 'socket.io';
import {publisher,subscriber} from './redis-connection.js';

dotenv.config({path:'./.env',quiet:true});

const CHECKBOX_COUNT = 10000 
const state = {
    checkboxes : new Array(CHECKBOX_COUNT).fill(false),
}

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
            state.checkboxes[index] = value;
            io.emit('server:checkbox-state',JSON.parse(data));
        }

    })

    io.on('connection',(socket) => {
        console.log(`Socket with socket id ${socket.id} is connected`);

        socket.on('client:checkboxClicked', (data) => {
            
            console.log('data received',data);
            //io.emit('server:checkbox-state',data);
            publisher.publish('in-memory-db:checkboxClicked',JSON.stringify(data));
            //state.checkboxes[data.index] = data.value;
        })
        
    })

    app.get('/checkboxes',(req,res) => {
        res.json({checkboxes : state.checkboxes});
    })

    server.listen(PORT,(req,res) => {
        console.log(`Server is running on ${PORT}`);
    })


}

main();
