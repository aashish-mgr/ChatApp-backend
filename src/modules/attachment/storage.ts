import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

/** What a successful `save` produced. */
export interface StoredFile {
  /** Opaque name the file is stored under. */
  storedName: string;
  /** Size in bytes. */
  size: number;
}

/** A file ready to be streamed back to a client. */
export interface OpenedFile {
  stream: Readable;
  size: number;
}

/**
 * Where uploaded files live.
 *
 * The app only ever talks to this interface, so swapping the local disk for
 * S3 (or any other object store) later means writing one more implementation
 * and changing one line in `createStorage`.
 */
export interface AttachmentStorage {
  /** Persists a file and returns the name it was stored under. */
  save(input: { buffer: Buffer; extension: string }): Promise<StoredFile>;
  /** Opens a stored file for reading, or null when it no longer exists. */
  open(storedName: string): Promise<OpenedFile | null>;
  /** Deletes a stored file. Missing files are not an error. */
  remove(storedName: string): Promise<void>;
}

/**
 * Stored names are opaque ids, so they are validated before they are joined
 * with the upload directory. This keeps a crafted name from escaping it.
 */
const SAFE_STORED_NAME = /^[a-f0-9-]{36}\.[a-z0-9]{1,10}$/;

export const isSafeStoredName = (storedName: string): boolean =>
  SAFE_STORED_NAME.test(storedName);

/** Stores uploads on the local filesystem, under `directory`. */
export class LocalDiskStorage implements AttachmentStorage {
  constructor(private readonly directory: string) {}

  /** Creates the upload directory if it does not exist yet. */
  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async save(input: { buffer: Buffer; extension: string }): Promise<StoredFile> {
    await this.init();

    const storedName = `${randomUUID()}${input.extension}`;
    await writeFile(path.join(this.directory, storedName), input.buffer);

    return { storedName, size: input.buffer.byteLength };
  }

  async open(storedName: string): Promise<OpenedFile | null> {
    if (!isSafeStoredName(storedName)) return null;

    const filePath = path.join(this.directory, storedName);
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) return null;

      return { stream: createReadStream(filePath), size: stats.size };
    } catch {
      // The file was removed (or never existed): the caller answers 404.
      return null;
    }
  }

  async remove(storedName: string): Promise<void> {
    if (!isSafeStoredName(storedName)) return;

    try {
      await rm(path.join(this.directory, storedName), { force: true });
    } catch {
      // A file we cannot delete is not worth failing the request over; the
      // database row is still removed, so it can never be served again.
    }
  }
}

/**
 * Builds the storage implementation for this deployment. Local disk is the
 * only implementation today; the seam is here so an S3-compatible backend can
 * be added without touching the routes or the socket handlers.
 */
export const createStorage = (directory: string): AttachmentStorage =>
  new LocalDiskStorage(directory);
