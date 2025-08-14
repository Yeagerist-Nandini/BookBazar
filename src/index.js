import dotenv from "dotenv";
import { createSocketServer } from './services/socketServer.js';

dotenv.config();

const port = process.env.PORT || 8000;

// app.listen(port, () => {
//     console.log(`Server is running on port: ${port}`);
// })

await createSocketServer({port});
