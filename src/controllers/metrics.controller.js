import metricsService from "../services/metrics.service.js";
import logger from "../config/logger.js";

export const getAllNodeMetrics = async (req, res) => {
  try {
    logger.info("Fetching all node metrics");
    const metrics = await metricsService.getAllNodeMetrics();

    logger.info(`Successfully retrieved metrics for ${metrics.length} nodes`);
    res.json({
      success: true,
      data: metrics,
      count: metrics.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch all node metrics", {
      error: error.message,
      stack: error.stack,
    });

    // Return appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes("Metrics server is not available")) {
      statusCode = 503; // Service Unavailable
    } else if (error.message.includes("Cannot connect to Kubernetes")) {
      statusCode = 502; // Bad Gateway
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

export const getNodeMetricsByName = async (req, res) => {
  try {
    const { name } = req.params;

    // Validate that name parameter exists
    if (!name || name.trim() === "") {
      logger.warn("Node name parameter is missing or empty for metrics", {
        params: req.params,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Node name parameter is required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`Fetching metrics for node: ${name}`);

    const metrics = await metricsService.getNodeMetricsByName(name.trim());

    logger.info(`Successfully retrieved metrics for node: ${name}`);
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Failed to fetch metrics for node: ${req.params.name}`, {
      nodeName: req.params.name,
      error: error.message,
      stack: error.stack,
    });

    // Return appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes("not found")) {
      statusCode = 404; // Not Found
    } else if (error.message.includes("Metrics server is not available")) {
      statusCode = 503; // Service Unavailable
    } else if (error.message.includes("Cannot connect to Kubernetes")) {
      statusCode = 502; // Bad Gateway
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

export default {
  getAllNodeMetrics,
  getNodeMetricsByName,
};
