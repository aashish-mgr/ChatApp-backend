import { prisma } from "../../config/prisma";
import { Server, Socket } from "socket.io";
import { getAuthUser, getUserRoom } from "../auth";
import { handleError, requireAuth } from "../../middleware";
import { createRoomName } from "./room-name";
import { messageInclude, serializeMessage } from "./message.shape";
import {
  collectRoomAttachmentNames,
  deleteAttachment,
  deleteStoredFiles,
} from "../attachment/attachment.service";

/** Keeps parity with the composer's client-side limit (MAX_MESSAGE_LENGTH). */
const MAX_CONTENT_LENGTH = 4000;

export const messageSocket = (io: Server, socket: Socket) => {
  socket.on(
    "room:open",
    requireAuth(
      handleError(
        async (targetUserId: string, ack?: (result: Object) => void) => {
          const userId = getAuthUser(socket)!.id;

          if (!targetUserId) {
            return ack?.({
              status: 400,
              message: "Please provide target user id.",
            });
          }

          if (targetUserId === userId) {
            return ack?.({
              status: 400,
              message: "You cannot open a room with yourself.",
            });
          }

          const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
          });
          if (!targetUser) {
            return ack?.({
              status: 404,
              message: "Target user not found.",
            });
          }

          const roomName = createRoomName(userId, targetUserId);

          const existingRoom = await prisma.room.findFirst({
            where: {
              name: roomName,
              isGroup: false,
            },
          });

          if (existingRoom) {
            await prisma.roomMember.upsert({
              where: {
                userId_roomId: { userId, roomId: existingRoom.id },
              },
              update: {},
              create: { userId, roomId: existingRoom.id },
            });
            socket.join(existingRoom.id);
            io.to(getUserRoom(targetUserId)).emit("room:new", {
              roomId: existingRoom.id,
            });
            return ack?.({
              status: 200,
              message: "Room already exists.",
              roomId: existingRoom.id,
            });
          }

          let newRoom;
          try {
            newRoom = await prisma.room.create({
              data: {
                name: roomName,
                isGroup: false,
                createdById: userId,
                members: {
                  create: [
                    { userId: userId, role: "admin" },
                    { userId: targetUserId, role: "member" },
                  ],
                },
              },
            });
          } catch (error) {
            if ((error as { code?: string }).code === "P2002") {
              const room = await prisma.room.findFirst({
                where: { name: roomName, isGroup: false },
              });
              if (room) {
                await prisma.roomMember.upsert({
                  where: {
                    userId_roomId: { userId, roomId: room.id },
                  },
                  update: {},
                  create: { userId, roomId: room.id },
                });
                socket.join(room.id);
                io.to(getUserRoom(targetUserId)).emit("room:new", {
                  roomId: room.id,
                });
                return ack?.({
                  status: 200,
                  message: "Room already exists.",
                  roomId: room.id,
                });
              }
            }
            throw error;
          }

          socket.join(newRoom.id);
          io.to(getUserRoom(targetUserId)).emit("room:new", {
            roomId: newRoom.id,
          });

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
    "room:list",
    requireAuth(
      handleError(async (ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        const rooms = await prisma.room.findMany({
          where: { members: { some: { userId: userId } } },
          include: {
            members: {
              include: { user: { select: { id: true, username: true } } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: messageInclude,
            },
          },
        });

        const roomsWithMeta = (
          await Promise.all(
            rooms.map(async (room) => {
              const self = room.members.find(
                (member) => member.userId === userId,
              );
              const since =
                self?.lastReadAt ?? self?.joinedAt ?? room.createdAt;
              const unreadCount = await prisma.message.count({
                where: {
                  roomId: room.id,
                  senderId: { not: userId },
                  createdAt: { gt: since },
                },
              });

              return {
                id: room.id,
                name: room.name,
                isGroup: room.isGroup,
                createdAt: room.createdAt,
                members: room.members.map((member) => ({
                  ...member.user,
                  role: member.role,
                })),
                lastMessage: room.messages[0]
                  ? serializeMessage(room.messages[0])
                  : null,
                unreadCount,
              };
            }),
          )
        ).sort((a, b) => {
          const aTime = a.lastMessage?.createdAt ?? a.createdAt;
          const bTime = b.lastMessage?.createdAt ?? b.createdAt;
          return bTime.getTime() - aTime.getTime();
        });

        return ack?.({
          status: 200,
          message: "Rooms fetched successfully.",
          rooms: roomsWithMeta,
        });
      }),
    ),
  );

  socket.on(
    "message:history",
    requireAuth(
      handleError(
        async (
          {
            roomId,
            cursor,
            limit,
          }: { roomId: string; cursor?: string; limit?: number },
          ack?: (result: Object) => void,
        ) => {
          const userId = getAuthUser(socket)!.id;

          if (!roomId) {
            return ack?.({
              status: 400,
              message: "Please provide roomId.",
            });
          }

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
          if (!isRoomMember) {
            return ack?.({
              status: 403,
              message: "You are not a member of this room.",
            });
          }

          const take = Math.min(Math.max(limit ?? 50, 1), 100);

          const messages = await prisma.message.findMany({
            where: { roomId: roomId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: messageInclude,
          });

          const hasMore = messages.length > take;
          const page = hasMore ? messages.slice(0, take) : messages;
          const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;

          return ack?.({
            status: 200,
            message: "Messages fetched successfully.",
            messages: page.map(serializeMessage),
            nextCursor,
            hasMore,
          });
        },
      ),
    ),
  );

  socket.on(
    "message:send",
    requireAuth(
      handleError(
        async (
          {
            roomId,
            content,
            attachmentId,
          }: { roomId: string; content: string; attachmentId?: string },
          ack?: (result: Object) => void,
        ) => {
          const text = typeof content === "string" ? content.trim() : "";
          if (!roomId || (!text && !attachmentId)) {
            return ack?.({
              status: 400,
              message: "Please provide roomId and content.",
            });
          }
          if (text.length > MAX_CONTENT_LENGTH) {
            return ack?.({
              status: 400,
              message: `Message content must be at most ${MAX_CONTENT_LENGTH} characters.`,
            });
          }
          const userId = getAuthUser(socket)!.id;
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

          if (attachmentId) {
            const attachment = await prisma.attachment.findUnique({
              where: { id: attachmentId },
              select: {
                id: true,
                roomId: true,
                uploaderId: true,
                message: { select: { id: true } },
              },
            });

            if (!attachment) {
              return ack?.({
                status: 404,
                message: "Attachment not found.",
              });
            }
            if (attachment.roomId !== roomId) {
              return ack?.({
                status: 400,
                message: "That attachment does not belong to this conversation.",
              });
            }
            if (attachment.uploaderId !== userId) {
              return ack?.({
                status: 403,
                message: "That attachment was uploaded by someone else.",
              });
            }
            if (attachment.message) {
              return ack?.({
                status: 409,
                message: "That attachment is already part of a message.",
              });
            }
          }

          const message = await prisma.message.create({
            data: {
              roomId: roomId,
              content: text,
              senderId: userId,
              attachmentId: attachmentId ?? null,
            },
            include: messageInclude,
          });

          io.to(roomId).emit("message:new", serializeMessage(message));

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
    "message:update",
    requireAuth(
      handleError(
        async (
          { messageId, content }: { messageId: string; content: string },
          ack?: (result: Object) => void,
        ) => {
          if (!messageId || typeof content !== "string") {
            return ack?.({
              status: 400,
              message: "Please provide messageId and content.",
            });
          }
          if (content.length > MAX_CONTENT_LENGTH) {
            return ack?.({
              status: 400,
              message: `Message content must be at most ${MAX_CONTENT_LENGTH} characters.`,
            });
          }

          const userId = getAuthUser(socket)!.id;
          const message = await prisma.message.findFirst({
            where: { id: messageId },
            select: { id: true, senderId: true, attachmentId: true },
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

          const text = content.trim();
          if (!text && !message.attachmentId) {
            return ack?.({
              status: 400,
              message: "A message cannot be empty.",
            });
          }

          const updated = await prisma.message.update({
            where: { id: messageId },
            data: { content: text, editedAt: new Date() },
            include: messageInclude,
          });

          io.to(updated.roomId).emit(
            "message:updated",
            serializeMessage(updated),
          );

          return ack?.({
            status: 200,
            message: "Message updated successfully.",
          });
        },
      ),
    ),
  );

  socket.on(
    "message:delete",
    requireAuth(
      handleError(async (messageId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!messageId) {
          return ack?.({
            status: 400,
            message: "Please provide messageId.",
          });
        }

        const message = await prisma.message.findFirst({
          where: {
            id: messageId,
          },
          select: {
            id: true,
            senderId: true,
            roomId: true,
            attachmentId: true,
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
        if (message.attachmentId) {
          await deleteAttachment(message.attachmentId);
        }
        io.to(message.roomId).emit("message:deleted", { messageId });
        return ack?.({ status: 200, message: "Message deleted successfully." });
      }),
    ),
  );

  socket.on(
    "room:leave",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!roomId) {
          return ack?.({
            status: 400,
            message: "Please provide roomId.",
          });
        }

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

        await prisma.roomMember.delete({
          where: {
            userId_roomId: { userId, roomId },
          },
        });
        io.to(getUserRoom(userId)).emit("room:deleted", { roomId });
        socket.leave(roomId);
        return ack?.({ status: 200, message: "Left room successfully." });
      }),
    ),
  );

  socket.on(
    "room:read",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!roomId) {
          return ack?.({
            status: 400,
            message: "Please provide roomId.",
          });
        }

        const { count } = await prisma.roomMember.updateMany({
          where: { roomId, userId },
          data: { lastReadAt: new Date() },
        });
        if (count === 0) {
          return ack?.({
            status: 403,
            message: "You are not a member of this room.",
          });
        }

        io.to(getUserRoom(userId)).emit("room:read", { roomId });
        return ack?.({ status: 200, message: "Room marked as read." });
      }),
    ),
  );

  socket.on(
    "room:delete",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!roomId) {
          return ack?.({
            status: 400,
            message: "Please provide roomId.",
          });
        }

        const room = await prisma.room.findUnique({
          where: {
            id: roomId,
          },
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
        if (!isRoomMember) {
          return ack?.({
            status: 403,
            message: "You are not a member of this room.",
          });
        }

        const storedNames = await collectRoomAttachmentNames(roomId);

        await prisma.room.delete({
          where: {
            id: roomId,
          },
        });
        await deleteStoredFiles(storedNames);
        io.to(roomId).emit("room:deleted", { roomId });
        io.socketsLeave(roomId);
        return ack?.({ status: 200, message: "Room deleted successfully." });
      }),
    ),
  );

  socket.on(
    "room:createGroup",
    requireAuth(
      handleError(
        async (
          {
            name,
            memberIds,
          }: { name?: string; memberIds?: string[] },
          ack?: (result: Object) => void,
        ) => {
          const userId = getAuthUser(socket)!.id;

          if (!name || typeof name !== "string" || !name.trim()) {
            return ack?.({
              status: 400,
              message: "Please provide a group name.",
            });
          }

          if (!Array.isArray(memberIds)) {
            return ack?.({
              status: 400,
              message: "Please provide member ids.",
            });
          }

          const uniqueMembers = Array.from(
            new Set([...memberIds.filter((id) => id && id !== userId), userId]),
          );

          if (uniqueMembers.length < 2) {
            return ack?.({
              status: 400,
              message: "A group needs at least one other member.",
            });
          }

          const users = await prisma.user.findMany({
            where: { id: { in: uniqueMembers } },
            select: { id: true },
          });
          const found = new Set(users.map((u) => u.id));
          if (uniqueMembers.some((id) => !found.has(id))) {
            return ack?.({
              status: 404,
              message: "One or more users not found.",
            });
          }

          const group = await prisma.room.create({
            data: {
              name: name.trim(),
              isGroup: true,
              createdById: userId,
              members: {
                create: uniqueMembers.map((id) => ({
                  userId: id,
                  roomId: undefined as any, // not needed
                  role: id === userId ? "admin" : "member",
                })),
              },
            } as any,
          });

          for (const id of uniqueMembers) {
            if (id !== userId) {
              io.to(getUserRoom(id)).emit("room:new", { roomId: group.id });
            }
          }
          socket.join(group.id);

          return ack?.({
            status: 200,
            message: "Group created successfully.",
            roomId: group.id,
          });
        },
      ),
    ),
  );

  socket.on(
    "room:addMember",
    requireAuth(
      handleError(
        async (
          { roomId, userId: targetUserId }: { roomId: string; userId: string },
          ack?: (result: Object) => void,
        ) => {
          const actorId = getAuthUser(socket)!.id;
          if (!roomId || !targetUserId) {
            return ack?.({
              status: 400,
              message: "Please provide roomId and userId.",
            });
          }

          const room = await prisma.room.findUnique({ where: { id: roomId } });
          if (!room || !room.isGroup) {
            return ack?.({
              status: 400,
              message: "This action is only available for groups.",
            });
          }

          const [actor, target, existing] = await Promise.all([
            prisma.roomMember.findUnique({
              where: { userId_roomId: { userId: actorId, roomId } },
            }),
            prisma.user.findUnique({ where: { id: targetUserId } }),
            prisma.roomMember.findUnique({
              where: { userId_roomId: { userId: targetUserId, roomId } },
            }),
          ]);

          if (!actor) {
            return ack?.({ status: 403, message: "You are not a member of this room." });
          }
          if (actor.role !== "admin") {
            return ack?.({ status: 403, message: "Only admins can add members." });
          }
          if (!target) {
            return ack?.({ status: 404, message: "Target user not found." });
          }
          if (existing) {
            return ack?.({ status: 409, message: "User already in the group." });
          }

          await prisma.roomMember.create({
            data: { userId: targetUserId, roomId, role: "member" },
          });
          io.to(getUserRoom(targetUserId)).emit("room:new", { roomId });
          io.to(roomId).emit("room:memberAdded", { roomId, userId: targetUserId });

          return ack?.({ status: 200, message: "Member added successfully." });
        },
      ),
    ),
  );

  socket.on(
    "room:removeMember",
    requireAuth(
      handleError(
        async (
          { roomId, userId: targetUserId }: { roomId: string; userId: string },
          ack?: (result: Object) => void,
        ) => {
          const actorId = getAuthUser(socket)!.id;
          if (!roomId || !targetUserId) {
            return ack?.({
              status: 400,
              message: "Please provide roomId and userId.",
            });
          }

          const room = await prisma.room.findUnique({ where: { id: roomId } });
          if (!room || !room.isGroup) {
            return ack?.({
              status: 400,
              message: "This action is only available for groups.",
            });
          }

          const [actor, targetMember] = await Promise.all([
            prisma.roomMember.findUnique({
              where: { userId_roomId: { userId: actorId, roomId } },
            }),
            prisma.roomMember.findUnique({
              where: { userId_roomId: { userId: targetUserId, roomId } },
            }),
          ]);

          if (!actor) {
            return ack?.({ status: 403, message: "You are not a member of this room." });
          }
          if (!targetMember) {
            return ack?.({ status: 404, message: "User not in the group." });
          }
          if (actor.role !== "admin" && actorId !== targetUserId) {
            return ack?.({ status: 403, message: "Not authorized." });
          }

          await prisma.roomMember.delete({
            where: { userId_roomId: { userId: targetUserId, roomId } },
          });
          io.to(getUserRoom(targetUserId)).emit("room:deleted", { roomId });
          io.to(roomId).emit("room:memberRemoved", { roomId, userId: targetUserId });

          return ack?.({ status: 200, message: "Member removed successfully." });
        },
      ),
    ),
  );
};
