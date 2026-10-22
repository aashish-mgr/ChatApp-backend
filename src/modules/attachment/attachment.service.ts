import { prisma } from "../../config/prisma";
import { envConfig } from "../../config/env";
import { extensionForMimeType, sanitizeFilename } from "./limits";
import { createStorage, type AttachmentStorage } from "./storage";

/**
 * How long an upload may sit unattached before it is swept away.
 *
 * A file is uploaded first and linked to a message afterwards, so an upload
 * that is never sent leaves an orphan behind. One hour is long enough for a
 * slow connection and a user who writes a caption, short enough that the
 * uploads directory does not grow without bound.
 */
export const ORPHAN_ATTACHMENT_TTL_MS = 60 * 60 * 1000;

let storage: AttachmentStorage | null = null;

/** The storage backend for this process (local disk today). */
export const getStorage = (): AttachmentStorage => {
  if (!storage) {
    storage = createStorage(envConfig.uploadDir);
  }
  return storage;
};

/** The public shape of an attachment, as sent to clients. */
export interface AttachmentView {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Path the file can be fetched from. */
  url: string;
}

export const toAttachmentView = (attachment: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}): AttachmentView => ({
  id: attachment.id,
  filename: attachment.filename,
  mimeType: attachment.mimeType,
  size: attachment.size,
  url: `/api/attachments/${attachment.id}`,
});

/**
 * Stores an uploaded file and records it against a room.
 *
 * The file is written first: if the database write then fails, the file is
 * removed again, so a failed upload never leaves bytes on disk.
 */
export const createAttachment = async (input: {
  userId: string;
  roomId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<AttachmentView> => {
  const store = getStorage();
  const stored = await store.save({
    buffer: input.buffer,
    extension: extensionForMimeType(input.mimeType),
  });

  try {
    const attachment = await prisma.attachment.create({
      data: {
        filename: sanitizeFilename(input.filename),
        storedName: stored.storedName,
        mimeType: input.mimeType,
        size: stored.size,
        uploaderId: input.userId,
        roomId: input.roomId,
      },
    });

    return toAttachmentView(attachment);
  } catch (error) {
    await store.remove(stored.storedName);
    throw error;
  }
};

/**
 * Loads an attachment the user is allowed to see.
 *
 * Access follows the room: only members of the room the file was uploaded to
 * may download it.
 */
export const findAttachmentForMember = async (
  attachmentId: string,
  userId: string,
): Promise<{
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storedName: string;
} | null> => {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      room: { members: { some: { userId } } },
    },
  });

  return attachment ?? null;
};

/** Deletes an attachment row and the file behind it. */
export const deleteAttachment = async (
  attachmentId: string,
): Promise<void> => {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment) return;

  await prisma.attachment.delete({ where: { id: attachmentId } });
  await getStorage().remove(attachment.storedName);
};

/**
 * Deletes the files of a room's attachments.
 *
 * Called before the room itself is deleted: deleting the room cascades the
 * attachment rows away, so the file names have to be collected first.
 */
export const collectRoomAttachmentNames = async (
  roomId: string,
): Promise<string[]> => {
  const attachments = await prisma.attachment.findMany({
    where: { roomId },
    select: { storedName: true },
  });

  return attachments.map((attachment) => attachment.storedName);
};

/** Deletes stored files by name. Missing files are not an error. */
export const deleteStoredFiles = async (
  storedNames: string[],
): Promise<void> => {
  const store = getStorage();
  for (const storedName of storedNames) {
    await store.remove(storedName);
  }
};

/** Deletes the file of an attachment without touching its row. */
export const deleteAttachmentFile = async (
  storedName: string,
): Promise<void> => {
  await getStorage().remove(storedName);
};

/**
 * Removes uploads that were never attached to a message.
 *
 * Returns the number of attachments that were swept.
 */
export const sweepOrphanAttachments = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - ORPHAN_ATTACHMENT_TTL_MS);

  const orphans = await prisma.attachment.findMany({
    where: {
      createdAt: { lt: cutoff },
      message: null,
    },
    select: { id: true, storedName: true },
  });

  if (orphans.length === 0) return 0;

  const store = getStorage();
  for (const orphan of orphans) {
    await prisma.attachment.delete({ where: { id: orphan.id } }).catch(() => {
      // Another sweep may have removed it already.
    });
    await store.remove(orphan.storedName);
  }

  return orphans.length;
};
