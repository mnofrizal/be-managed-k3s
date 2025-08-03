import express from "express";
import cors from "cors";
import http from "http";
import nodeRoutes from "./routes/node.routes.js";
import deploymentRoutes from "./routes/deployment.routes.js";
import logger from "./config/logger.js";
import { createTerminalWebSocketServer } from "./websocket/terminal.websocket.js";
import { createLogWebSocketServer } from "./websocket/logs.websocket.js";
import { createDeploymentLogWebSocketServer } from "./websocket/deployment.websocket.js";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Websocket
const terminalWss = createTerminalWebSocketServer(server);
const logWss = createLogWebSocketServer(server);
const deploymentLogWss = createDeploymentLogWebSocketServer(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

// Routes
app.use("/api", nodeRoutes);
app.use("/api/deployments", deploymentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error occurred", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
  });

  res.status(404).json({
    success: false,
    error: "Not found",
    message: "The requested endpoint does not exist",
  });
});

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (
    pathname.match(
      /^\/api\/namespaces\/[a-zA-Z0-9.-]+\/pods\/[a-zA-Z0-9.-]+\/terminal$/
    )
  ) {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit("connection", ws, request);
    });
  } else if (
    pathname.match(
      /^\/api\/namespaces\/[a-zA-Z0-9.-]+\/pods\/[a-zA-Z0-9.-]+\/logs\/stream$/
    )
  ) {
    logWss.handleUpgrade(request, socket, head, (ws) => {
      logWss.emit("connection", ws, request);
    });
  } else if (
    pathname.match(/^\/api\/deployments\/[a-zA-Z0-9.-]+\/logs\/stream$/)
  ) {
    deploymentLogWss.handleUpgrade(request, socket, head, (ws) => {
      deploymentLogWss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, () => {
  logger.info(`K3s Management API started successfully on port ${port}`);
});

export default app;
