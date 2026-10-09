import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { envConfig } from "./env";

const adapter = new PrismaPg({ connectionString: envConfig.databaseUrl });
export const prisma = new PrismaClient({ adapter });