import {config} from "dotenv";
config();

export const envConfig = {
    port: process.env.PORT || 3000,
}

