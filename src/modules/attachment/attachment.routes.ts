import { Router, type Request, type Response } from "express";
import multer from "multer";
import { prisma } from "../../config/prisma";
import {
  requireHttpAuth,
  type AuthenticatedRequest,
} from "../../middleware/http-auth.middleware";
import {
  MAX_ATTACHMENT_SIZE,
  formatBytes,
  isAllowedMimeType,
} from "./limits";
import { createAttachment, findAttachmentForMember, getStorage } from "./attachment.service";

/** Attachment ids are uuids; anything else cannot exist. */
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Uploads are buffered in memory and then written to storage by the service.
 * The limit is enforced by multer, so an oversized body is rejected while it
 * is still being read rather than after it was fully buffered.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE,
    files: 1,
    fields: 4,
  },
});

const sendError = (res: Response, status: number, message: string): void => {
  res.status(status).json({ status, message });
};

/** Runs the multer middleware and turns its errors into clean responses. */
const receiveFile = (
  req: Request,
  res: Response,
  onUploaded: () => Promise<void>,
): void => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "LIMIT_FILE_SIZE") {
        sendError(
          res,
          413,
          `File is too large. The maximum size is ${formatBytes(MAX_ATTACHMENT_SIZE)}.`,
        );
        return;
      }
      if (code === "LIMIT_UNEXPECTED_FILE") {
        sendError(res, 400, 'Send the file as the "file" field.');
        return;
      }
      console.error("Attachment upload error:", error);
      sendError(res, 400, "The upload could not be read.");
      return;
    }

    void onUploaded().catch((uploadError) => {
      console.error("Attachment upload error:", uploadError);
      sendError(res, 500, "The upload could not be saved.");
    });
  });
};

export const attachmentRouter = Router();

/**
 * `POST /api/attachments` — uploads a file to a room.
 *
 * Form fields:
 * - `file`  — the uploaded file (required)
 * - `roomId` — the room the file belongs to (required)
 *
 * Answers with the attachment, which the client then references when it
 * sends the message.
 */
attachmentRouter.post("/", requireHttpAuth, (req, res) => {
  receiveFile(req, res, async () => {
    const userId = (req as AuthenticatedRequest).user.id;
    const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : "";
    const file = req.file;

    if (!roomId) {
      sendError(res, 400, "Please provide a roomId.");
      return;
    }
    if (!file) {
      sendError(res, 400, "Please attach a file.");
      return;
    }
    if (!isAllowedMimeType(file.mimetype)) {
      sendError(res, 415, "That file type is not supported.");
      return;
    }

    const isRoomMember = await prisma.roomMember.findFirst({
      where: { roomId, userId },
      select: { userId: true },
    });
    if (!isRoomMember) {
      sendError(res, 403, "You are not a member of this room.");
      return;
    }

    const attachment = await createAttachment({
      userId,
      roomId,
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });

    res.status(201).json({ status: 201, message: "File uploaded.", attachment });
  });
});

/**
 * `GET /api/attachments/:id` — downloads a file.
 *
 * Only members of the room the file was uploaded to may read it.
 */
attachmentRouter.get("/:id", requireHttpAuth, async (req, res) => {
  const rawId = req.params.id;
  const attachmentId = typeof rawId === "string" ? rawId : "";
  if (!ATTACHMENT_ID.test(attachmentId)) {
    sendError(res, 404, "Attachment not found.");
    return;
  }

  const userId = (req as AuthenticatedRequest).user.id;
  const attachment = await findAttachmentForMember(attachmentId, userId);
  if (!attachment) {
    // The file does not exist, or it belongs to a room the caller is not in.
    sendError(res, 404, "Attachment not found.");
    return;
  }

  const opened = await getStorage().open(attachment.storedName);
  if (!opened) {
    sendError(res, 404, "Attachment not found.");
    return;
  }

  // `filename*` carries the UTF-8 name; `filename` is the ASCII fallback for
  // older clients.
  const encodedName = encodeURIComponent(attachment.filename);
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Length", String(opened.size));
  res.setHeader(
    "Content-Disposition",
    `inline; filename="attachment"; filename*=UTF-8''${encodedName}`,
  );
  // The file is private to the conversation, so it must not sit in a shared
  // cache.
  res.setHeader("Cache-Control", "private, max-age=3600");

  opened.stream.on("error", () => {
    res.destroy();
  });

  opened.stream.pipe(res);
});
