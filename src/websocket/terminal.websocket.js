import WebSocket from "ws";
import podService from "../services/pod.service.js";
import logger from "../config/logger.js";
import url from "url";

export const createTerminalWebSocketServer = (server) => {
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", async (ws, req) => {
    const location = url.parse(req.url, true);
    const { containerName, shell } = location.query;

    const pathMatch = location.pathname.match(
      /^\/api\/namespaces\/([a-zA-Z0-9.-]+)\/pods\/([a-zA-Z0-9.-]+)\/terminal$/
    );

    if (!pathMatch) {
      logger.error("Invalid terminal URL format");
      ws.close(1008, "Invalid URL format");
      return;
    }

    const namespace = pathMatch[1];
    const podName = pathMatch[2];

    if (!namespace || !podName) {
      logger.error(
        "Terminal WebSocket connection failed: namespace and podName are required"
      );
      ws.close(1008, "Namespace and pod name are required");
      return;
    }

    logger.info("Terminal WebSocket connection established", {
      namespace,
      podName,
      containerName,
    });

    try {
      await podService.connectToPodTerminal(
        ws,
        namespace,
        podName,
        containerName,
        shell
      );
    } catch (error) {
      logger.error("Failed to connect to pod terminal", {
        error: error.message,
        stack: error.stack,
      });
      ws.close(1011, "Failed to connect to pod terminal");
    }

    ws.on("close", () => {
      logger.info("Terminal WebSocket connection closed");
    });
  });

  return wss;
};
