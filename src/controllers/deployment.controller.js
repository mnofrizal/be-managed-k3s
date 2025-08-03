import deploymentService from "../services/deployment.service.js";
import logger from "../config/logger.js";

export const getAllDeployments = async (req, res) => {
  try {
    const { namespace } = req.query;

    logger.info("Fetching all deployments", {
      namespace: namespace || "all namespaces",
    });

    const deployments = await deploymentService.getAllDeployments(namespace);

    logger.info(`Successfully retrieved ${deployments.length} deployments`);
    res.json({
      success: true,
      data: deployments,
      count: deployments.length,
      namespace: namespace || "all",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch all deployments", {
      error: error.message,
      stack: error.stack,
      namespace: req.query.namespace,
    });

    let statusCode = 500;
    if (error.message.includes("not found")) {
      statusCode = 404;
    } else if (error.message.includes("Cannot connect to Kubernetes")) {
      statusCode = 502;
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

export const getDeploymentByName = async (req, res) => {
  try {
    const { name } = req.params;
    const { namespace = "default" } = req.query;

    if (!name || name.trim() === "") {
      logger.warn("Deployment name parameter is missing or empty", {
        params: req.params,
        query: req.query,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Deployment name parameter is required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `Fetching deployment by name: ${name} in namespace: ${namespace}`
    );

    const deployment = await deploymentService.getDeploymentByName(
      name.trim(),
      namespace
    );

    logger.info(`Successfully retrieved deployment: ${name}`);
    res.json({
      success: true,
      data: deployment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Failed to fetch deployment: ${req.params.name}`, {
      deploymentName: req.params.name,
      namespace: req.query.namespace,
      error: error.message,
      stack: error.stack,
    });

    let statusCode = 500;
    if (error.message.includes("not found")) {
      statusCode = 404;
    } else if (error.message.includes("Cannot connect to Kubernetes")) {
      statusCode = 502;
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

export const streamDeploymentLogs = async (req, res) => {
  try {
    const { name } = req.params;
    const { namespace = "default" } = req.query;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Deployment name parameter is required",
      });
    }

    res.status(101).send("Switching protocols");
  } catch (error) {
    logger.error("Failed to initiate deployment log stream", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Failed to initiate deployment log stream",
    });
  }
};

export default {
  getAllDeployments,
  getDeploymentByName,
  streamDeploymentLogs,
};
