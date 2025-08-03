import express from "express";
import ingressController from "../controllers/ingress.controller.js";

const router = express.Router();

router.get("/", ingressController.getAllIngresses);

export default router;
