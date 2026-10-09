
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { envConfig } from "./env";

const adapter = new PrismaPg({ connectionString: envConfig.databaseUrl });
export const prisma = new PrismaClient({ adapter });

export const connectToDatabase = async () => {
    try {
        await prisma.$connect();
        console.log("Connected to the database");
    }
    catch (error) {
        console.error("Error connecting to the database:", error);
        process.exit(1);
    }
}