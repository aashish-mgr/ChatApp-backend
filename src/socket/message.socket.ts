import { prisma } from "../config/prisma";
import { Server, Socket } from "socket.io";
import { requireAuth } from "./auth";
import { handleError } from "../utils/errorHandler";

const createRoomName = (userA: string, userB: string) => {
  return [userA, userB].sort().join(":");
};

export const messageSocket = (io: Server, socket: Socket) => {
  socket.on(
    "room:open",
    requireAuth(
      handleError(
        async (targetUserId: string, ack?: (result: Object) => void) => {
        
          const userId = socket.data.user?.id;
          if (!targetUserId) {
            return ack?.({
              status: 400,
              message: "Please provide target user id.",
            });
          }
          const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
          });
          if(!targetUser) {
            return ack?.({
              status: 404,
              message: "Target user not found.",
            });
          }
          const roomName = createRoomName(userId, targetUserId);

          const existingRoom = await prisma.room.findUnique({
            where: {
              name: roomName,
            },
          });

          if (existingRoom) {
            socket.join(existingRoom.id);
            return ack?.({
              status: 200,
              message: "Room already exists.",
              roomId: existingRoom.id,
            });
          }

          const newRoom = await prisma.room.create({
            data: {
              name: roomName,
              createdById: userId,
              members: {
                create: [{ userId: userId }, { userId: targetUserId }],
              },
            },
          });

          socket.join(newRoom.id);

          return ack?.({
            status: 200,
            message: "Room created successfully.",
            roomId: newRoom.id,
          });
        },
      ),
    ),
  );

  socket.on(
    "message:history",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = socket.data.user?.id;
        const room = await prisma.room.findUnique({
          where: { id: roomId },
        });
        if (!room) {
          return ack?.({ status: 404, message: "Room not found." });
        }

        const isRoomMember = await prisma.roomMember.findFirst({
          where: {
            roomId: roomId,
            userId: userId,
          },
        });
        if(!isRoomMember) {
          return ack?.({
            status: 403,
            message: "You are not a member of this room.",
          });
        }

        const messages = await prisma.message.findMany({
          where: { roomId: roomId },
          orderBy: { createdAt: "desc" },
        });

        return ack?.({
          status: 200,
          message: "Messages fetched successfully.",
          messages,
        });
      }),
    ),
  );

  socket.on(
    "message:send",
    requireAuth(
      handleError(
        async (
          { roomId, content }: { roomId: string; content: string },
          ack?: (result: Object) => void,
        ) => {
          if (!roomId || !content) {
            return ack?.({
              status: 400,
              message: "Please provide roomId and content.",
            });
          }
          const userId = socket.data.user?.id;
          const isRoomMember = await prisma.roomMember.findFirst({
            where: {
              roomId: roomId,
              userId: userId,
            },
          });
          if (!isRoomMember) {
            return ack?.({
              status: 403,
              message: "You are not a member of this room.",
            });
          }

          const message = await prisma.message.create({
            data: {
              roomId: roomId,
              content: content,
              senderId: userId,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
              },
            },
          }});

          io.to(roomId).emit("message:new", message);

          return ack?.({
            status: 200,
            message: "Message sent successfully.",
            messageId: message.id,
          });
        },
      ),
    ),
  );

  socket.on(
    "message:delete",
    requireAuth(
      handleError(async (messageId: string, ack?: (result: Object) => void) => {
        const userId = socket.data.user?.id;
        const message = await prisma.message.findFirst({
          where: {
            id: messageId,
          },
        });
        if (!message) {
          return ack?.({ status: 404, message: "Message not found." });
        }

        if (message.senderId !== userId) {
          return ack?.({
            status: 403,
            message: "You are not the sender of this message.",
          });
        }

        await prisma.message.delete({
          where: {
            id: messageId,
          },
        });
        io.to(message.roomId).emit("message:deleted", { messageId });
        return ack?.({ status: 200, message: "Message deleted successfully." });
      }),
    ),
  );

  socket.on(
    "room:leave",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = socket.data.user?.id;
        const isRoomMember = await prisma.roomMember.findFirst({
          where: {
            roomId: roomId,
            userId: userId,
          },
        });
        if (!isRoomMember) {
          return ack?.({
            status: 403,
            message: "You are not a member of this room.",
          });
        }

        await socket.leave(roomId);
        return ack?.({ status: 200, message: "Left room successfully." });
      }),
    ),
  );

  socket.on(
    "room:delete",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = socket.data.user?.id;
        const room = await prisma.room.findUnique({
          where: {
            id: roomId,
          },
        });
        if (!room) {
          return ack?.({ status: 404, message: "Room not found." });
        }

        if (room.createdById !== userId) {
          return ack?.({
            status: 403,
            message: "You are not the creator of this room.",
          });
        }

        await prisma.room.delete({
          where: {
            id: roomId,
          },
        });
        io.to(roomId).emit("room:deleted", { roomId });
        io.socketsLeave(roomId); // Make all sockets leave the room
        return ack?.({ status: 200, message: "Room deleted successfully." });
      }),
    ),
  );
};
