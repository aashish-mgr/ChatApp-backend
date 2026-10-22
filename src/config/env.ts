import path from "node:path";
import {config} from "dotenv";
config();

export const envConfig = {
    port: process.env.PORT || 3000,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    accessTokenExpire: process.env.ACCESS_TOKEN_EXPIRE as string,
    clientUrl: process.env.CLIENT_URL,
    // Directory uploaded files are stored in. Relative paths resolve from the
    // directory the server was started in.
    uploadDir: process.env.UPLOAD_DIR
        ? path.resolve(process.env.UPLOAD_DIR)
        : path.resolve(process.cwd(), "uploads"),
}
