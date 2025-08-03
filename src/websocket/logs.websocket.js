import WebSocket from "ws";
import podService from "../services/pod.service.js";
import logger from "../config/logger.js";
import url from "url";

export const createLogWebSocketServer = (server) => {
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", async (ws, req) => {
    const location = url.parse(req.url, true);
    const { containerName } = location.query;

    const pathMatch = location.pathname.match(
      /^\/api\/namespaces\/([a-zA-Z0-9.-]+)\/pods\/([a-zA-Z0-9.-]+)\/logs\/stream$/
    );

    if (!pathMatch) {
      logger.error("Invalid log stream URL format");
      ws.close(1008, "Invalid URL format");
      return;
    }

    const namespace = pathMatch[1];
    const podName = pathMatch[2];

    if (!namespace || !podName) {
      logger.error(
        "Log stream WebSocket connection failed: namespace and podName are required"
      );
      ws.close(1008, "Namespace and pod name are required");
      return;
    }

    logger.info("Log stream WebSocket connection established", {
      namespace,
      podName,
      containerName,
    });

    try {
      await podService.streamPodLogs(ws, namespace, podName, containerName);
    } catch (error) {
      logger.error("Failed to stream pod logs", {
        error: error.message,
        stack: error.stack,
      });
      ws.close(1011, "Failed to stream pod logs");
    }

    ws.on("close", () => {
      logger.info("Log stream WebSocket connection closed");
    });
  });

  return wss;
};
