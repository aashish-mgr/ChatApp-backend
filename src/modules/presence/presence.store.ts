/**
 * In-memory presence registry.
 *
 * Maps a user id to the set of sockets currently connected for that user. A
 * user is "online" while the set exists and is non-empty, which naturally
 * handles multiple tabs/devices.
 *
 * NOTE: this is process-local. Running more than one server instance (or
 * restarting the server) would need a shared store such as Redis.
 */
const socketsByUser = new Map<string, Set<string>>();

/** Registers a socket. Returns true when the user just came online. */
export const addUserSocket = (userId: string, socketId: string): boolean => {
  const sockets = socketsByUser.get(userId);

  if (sockets) {
    sockets.add(socketId);
    return false;
  }

  socketsByUser.set(userId, new Set([socketId]));
  return true;
};

/** Unregisters a socket. Returns true when the user just went offline. */
export const removeUserSocket = (userId: string, socketId: string): boolean => {
  const sockets = socketsByUser.get(userId);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size > 0) return false;

  socketsByUser.delete(userId);
  return true;
};

export const isUserOnline = (userId: string): boolean =>
  socketsByUser.has(userId);

export const getOnlineUserIds = (): string[] =>
  Array.from(socketsByUser.keys());
