import {config} from "dotenv";
config();

export const envConfig = {
    port: process.env.PORT || 3000,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET ,
    accessTokenExpire: process.env.ACCESS_TOKEN_EXPIRE as string,
    clientUrl: process.env.CLIENT_URL,
}

