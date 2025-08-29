import http from 'http';
import { Server } from 'socket.io';
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import app from '../app.js';
import dotenv from "dotenv";
import { ApiError } from "../utils/api-error.js";
import  jwt  from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { redisPub, redisSub } from "../utils/redisClient.js";

dotenv.config();

let io;


export const createSocketServer = async({port}) => {
    //1.  Wrap Express in HTTP server
    const httpServer = http.createServer(app);


    //2. Create Socket.IO server
    io = new Server(httpServer, {
        cors: { 
            origin: "*",
            allowedHeaders: ['*'],
            credentials: true
        },
    });

    //3. create two redis clients for adapter/ Redis adapter for multi-instance scaling
    const pubClient = await redisPub();
    const subClient = await redisSub();
    io.adapter(createAdapter(pubClient, subClient));

    // 🔹 Subscribe to cart updates after subscriber connects
    await subClient.pSubscribe("cart:update:user:*", (message, channel) => {
        const userId = channel.split(":")[3];
        const updatedCart = JSON.parse(message);

        // emit to all sockets in that user's room
        io.to(`user:${userId}`).emit("cart:update", updatedCart);
    })

    
    //4. Auth + join per-user rooms
    io.use((socket, next) => {
        cookieParser()(socket.request, {}, (err)=> {
            if(err) return next(err);

            const token = socket.request.cookies.accessToken;
            if(!token) return next(new ApiError(400, "Authentication Error ws"))

            const payload = jwt.verify(token, process.env.ACCESS_TOKEN_REQUEST);
            socket.userId = payload.id;

            return next();
        })
    })


    //5. On connection, join a per-user room and optionally a session room
    io.on("connection", (socket) => {
        const userId = socket.userId;
        if(!userId){
            socket.disconnect(true);
            return;
        }

        const userRoom = `user:${userId}`;
        socket.join(userRoom);
        console.log(`Socket connected: ${socket.id} user:${userId}`);


        //Handle socket events here

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected', reason);
        });
    });

    //6. Start server
    httpServer.listen(port, () => {
        console.log(`Server is running on port: ${port}`)
    });

    return io;
}


export const getIO = () => {
    if(!io) throw new ApiError(500, "Socket.io not initialized yet");

    return io;
}


// Your cookieParser() in app.js only runs for normal HTTP requests handled by Express routes — it does not automatically run for the Socket.IO handshake requests, because Socket.IO’s upgrade flow doesn’t go through your Express middleware stack by default.

// takes raw cookie from http header
// const raw = socket.handshake.headers?.cookie || "";
// const cookies = cookie.parse(raw || "");
// const token = cookies.accessToken;



// Here’s what’s happening in that snippet — step by step:

// ### **2. `if (!userId) { socket.disconnect(true); return; }`**

// * **Why?**
//   If there’s no `userId`, it means the socket **failed authentication**.
//   We immediately **force-disconnect** that client to prevent unauthorized access.

// ---

// ### **3. `const userRoom = \`user:\${userId}\`;\`**

// * This creates a **private room name** unique to that user.
// * **Why?**

//   * In Socket.IO, a “room” is like a **private channel** that sockets can join.
//   * By giving each user their own private room (`user:42`), you can send events **only to that user**, even if they have multiple active connections (e.g., browser tabs).

// ---

// ### **4. `socket.join(userRoom);`**

// * Adds this socket connection to the user’s private room.
// * **Why?**

//   * Now, from anywhere in your server code, you can do:

//     ```js
//     io.to(`user:${userId}`).emit("someEvent", payload);
//     ```

//     …and it will send the message to **all tabs/devices** that belong to that same logged-in user.

// ---

// ### **5. `console.log(\`Socket connected: \${socket.id} user:\${userId}\`);\`**

// * Just for debugging — logs the unique socket ID and the user room name.