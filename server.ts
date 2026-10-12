import app from "./src/app";
import { envConfig } from "./src/config/env";
import { connectToDatabase } from "./src/config/prisma";
import { Server } from "socket.io";
import { initializeSocket } from "./src/socket";

const startServer = async () => {
  await connectToDatabase();
  const server = app.listen(envConfig.port, () => {
    console.log(`Server is running on port ${envConfig.port}`);
  });

  const io = new Server(server, {
    cors: {
      origin: envConfig.clientUrl ?? "*",
    },
  });
  initializeSocket(io);
};

startServer();
