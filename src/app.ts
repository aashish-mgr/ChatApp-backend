import cors from "cors";
import express from "express";
import { envConfig } from "./config/env";
import { attachmentRouter } from "./modules/attachment/attachment.routes";

const app = express();

// The frontend runs on its own origin, so the upload/download routes need
// CORS. The Socket.IO server configures CORS separately.
app.use(
  cors({
    origin: envConfig.clientUrl ?? "http://localhost:3001",
    credentials: true,
  }),
);

app.use(express.json());

// The first non-socket surface of the app: file uploads travel over HTTP.
app.use("/api/attachments", attachmentRouter);

export default app;
