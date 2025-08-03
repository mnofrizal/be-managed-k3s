import express from "express";
import serviceController from "../controllers/service.controller.js";

const router = express.Router();

router.get("/", serviceController.getAllServices);

export default router;
