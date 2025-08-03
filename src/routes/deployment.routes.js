import express from "express";
import deploymentController from "../controllers/deployment.controller.js";

const router = express.Router();

router.get("/", deploymentController.getAllDeployments);
router.get("/:name", deploymentController.getDeploymentByName);
router.get("/:name/logs/stream", deploymentController.streamDeploymentLogs);
router.get("/:name/pods", deploymentController.getDeploymentPods);

export default router;
