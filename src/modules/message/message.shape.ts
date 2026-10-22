import { Prisma } from "../../../generated/prisma/client";
import { toAttachmentView } from "../attachment/attachment.service";

/** The attachment fields clients are allowed to see. */
const attachmentSelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
} satisfies Prisma.AttachmentSelect;

/**
 * Sender and attachment, loaded with every message that leaves the server.
 *
 * One include for every query, so a message always carries the same shape
 * whether it arrives through the history, the room list or a live broadcast.
 */
export const messageInclude = {
  sender: { select: { id: true, username: true } },
  attachment: { select: attachmentSelect },
} satisfies Prisma.MessageInclude;

/** A message with its sender and attachment loaded. */
export type MessageWithRelations = Prisma.MessageGetPayload<{
  include: typeof messageInclude;
}>;

/**
 * Prepares a message for the wire: the attachment gains the URL it can be
 * downloaded from.
 */
export const serializeMessage = (message: MessageWithRelations) => ({
  ...message,
  attachment: message.attachment ? toAttachmentView(message.attachment) : null,
});
