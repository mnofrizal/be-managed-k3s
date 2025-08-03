import { WebSocketServer } from "ws";
import deploymentService from "../services/deployment.service.js";
import logger from "../config/logger.js";

export const createDeploymentLogWebSocketServer = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const namespace = searchParams.get("namespace");
    const deploymentName = req.url.split("/")[3];

    logger.info(
      `WebSocket connection established for deployment logs: ${deploymentName} in namespace: ${namespace}`
    );

    deploymentService.streamDeploymentLogs(ws, namespace, deploymentName);

    ws.on("close", () => {
      logger.info(
        `WebSocket connection closed for deployment logs: ${deploymentName} in namespace: ${namespace}`
      );
    });

    ws.on("error", (error) => {
      logger.error(
        `WebSocket error for deployment logs: ${deploymentName} in namespace: ${namespace}`,
        {
          error: error.message,
          stack: error.stack,
        }
      );
    });
  });

  return wss;
};
