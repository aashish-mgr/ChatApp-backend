import app from "./src/app";
import { envConfig } from "./src/config/env";

const startServer = () => {
   app.listen(envConfig.port, () => {
      console.log(`Server is running on port ${envConfig.port}`);
   });
}

startServer();
