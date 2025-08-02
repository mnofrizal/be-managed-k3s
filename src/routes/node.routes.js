import express from "express";
import nodeController from "../controllers/node.controller.js";
import metricsController from "../controllers/metrics.controller.js";
import podController from "../controllers/pod.controller.js";
import clusterController from "../controllers/cluster.controller.js";
import namespaceController from "../controllers/namespace.controller.js";
import logger from "../config/logger.js";
import { KubeConfig } from "@kubernetes/client-node";

const router = express.Router();

// Routes
router.get("/health", (req, res) => {
  logger.info("Health check endpoint accessed");

  try {
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromDefault();
    const currentContext = kubeConfig.getCurrentContext();

    res.json({
      success: true,
      message: "Server is running",
      kubernetes: {
        connected: true,
        context: currentContext,
      },
    });
  } catch (error) {
    logger.warn("Kubernetes configuration issue detected", {
      error: error.message,
    });

    res.json({
      success: true,
      message: "Server is running",
      kubernetes: {
        connected: false,
        error: error.message,
      },
    });
  }
});

router.get("/nodes", nodeController.getAllNodes);
router.get("/nodes/:name", nodeController.getNodeByName);

// Metrics routes
router.get("/metrics/nodes", metricsController.getAllNodeMetrics);
router.get("/metrics/nodes/:name", metricsController.getNodeMetricsByName);

// Pod routes
router.get("/pods", podController.getAllPods);
router.get("/pods/:name", podController.getPodByName);
router.get("/namespaces/:namespace/pods", podController.getPodsByNamespace);

// Cluster routes
router.get("/clusters", clusterController.getAllClusters);
router.get("/clusters/:name", clusterController.getClusterByName);

// Namespace routes
router.get("/namespaces", namespaceController.getAllNamespaces);
router.get("/namespaces/:name", namespaceController.getNamespaceByName);

export default router;
