import express from "express"
import dotenv from "dotenv"
import cookieParser from "cookie-parser";
import healthCheckRouter from "./routes/healthcheck.route.js"
import cartRouter from "./routes/cart.route.js";
import paymentRouter from "./routes/payment.route.js"
import orderRouter from "./routes/order.route.js"
import bookRouter from "./routes/book.route.js"

dotenv.config(); 

const app = express();

// export const db = new PrismaClient();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended: true}));


//cors

app.use("/api/v1", healthCheckRouter);
app.use("/api/v1", cartRouter);
app.use("/api/v1", paymentRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", bookRouter);

export default app;

