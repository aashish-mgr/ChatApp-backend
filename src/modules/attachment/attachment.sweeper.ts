import { sweepOrphanAttachments } from "./attachment.service";

/** How often unattached uploads are swept away. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Removes uploads that were never attached to a message.
 *
 * A file is uploaded before its message is sent, so a failed send (or a user
 * who simply picked a file and changed their mind) leaves an orphan behind.
 * The sweep keeps the uploads directory from growing without bound.
 *
 * The timer is unreferenced, so it never keeps the process alive.
 */
export const startAttachmentSweeper = (): NodeJS.Timeout => {
  const timer = setInterval(() => {
    void sweepOrphanAttachments()
      .then((count) => {
        if (count > 0) {
          console.log(`Removed ${count} unattached upload(s).`);
        }
      })
      .catch((error) => console.error("Attachment sweep error:", error));
  }, SWEEP_INTERVAL_MS);

  timer.unref();
  return timer;
};
