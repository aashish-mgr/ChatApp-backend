import app from "./src/app";
import { envConfig } from "./src/config/env";
import { connectToDatabase, prisma } from "./src/config/prisma";
import { Server } from "socket.io";
import { initializeSocket } from "./src/socket";

const startServer = async () => {
  await connectToDatabase();
  const server = app.listen(envConfig.port, () => {
    console.log(`Server is running on port ${envConfig.port}`);
  });

  const io = new Server(server, {
    cors: {
      // `credentials: true` cannot be combined with `origin: "*"` per the
      // CORS spec, so fall back to the dev origin instead of a wildcard.
      origin: envConfig.clientUrl ?? "http://localhost:3001",
      credentials: true,
    },
  });
  initializeSocket(io);

  // Graceful shutdown: stop accepting connections, close Socket.IO, then
  // disconnect Prisma so in-flight queries can finish.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    io.close(() => {
      server.close(() => {
        prisma
          .$disconnect()
          .catch((error) => console.error("Error disconnecting Prisma:", error))
          .finally(() => process.exit(0));
      });
    });
    // Force-exit if connections refuse to close.
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

startServer();
