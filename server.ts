import app from "./src/app";
import { envConfig } from "./src/config/env";
import {connectToDatabase} from "./src/config/prisma";
import { Server } from "socket.io";

const startServer =async () => {
   await connectToDatabase();
   const server = app.listen(envConfig.port, () => {
      console.log(`Server is running on port ${envConfig.port}`);
   });
 
   const io = new Server(server);

   io.on("connection", (socket) => {
      console.log("connected");
      socket.on("message", (data) => {
         console.log(data);
          socket.emit("response",  {
         message: "hi"
      })
      })

     
   })

  

}

startServer();
