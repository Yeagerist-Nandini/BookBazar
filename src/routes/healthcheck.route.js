import express from "express";
import healthCheck from "../controllers/healthchek.controller.js";

const router = express.Router();

router.get("/healthchek", healthCheck);

export default router;