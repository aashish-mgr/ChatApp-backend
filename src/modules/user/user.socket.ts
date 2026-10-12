import { prisma } from "../../config/prisma";
import { Server, Socket } from "socket.io";
import { getAuthUser } from "../auth";
import { handleError, requireAuth } from "../../middleware";

type Ack = (result: Object) => void;

export const userSocket = (_io: Server, socket: Socket) => {
  socket.on(
    "user:list",
    requireAuth(
      handleError(async (ack?: Ack) => {
        const userId = getAuthUser(socket)!.id;

        const users = await prisma.user.findMany({
          where: { id: { not: userId } },
          select: { id: true, username: true },
          orderBy: { username: "asc" },
          take: 100,
        });

        return ack?.({
          status: 200,
          message: "Users fetched successfully.",
          users,
        });
      }),
    ),
  );

  socket.on(
    "user:search",
    requireAuth(
      handleError(async (payload: { query?: string }, ack?: Ack) => {
        const userId = getAuthUser(socket)!.id;
        const query = payload?.query?.trim();

        if (!query) {
          return ack?.({
            status: 400,
            message: "Please provide a search query.",
          });
        }

        const users = await prisma.user.findMany({
          where: {
            id: { not: userId },
            username: { contains: query, mode: "insensitive" },
          },
          select: { id: true, username: true },
          orderBy: { username: "asc" },
          take: 50,
        });

        return ack?.({
          status: 200,
          message: "Users fetched successfully.",
          users,
        });
      }),
    ),
  );
};
