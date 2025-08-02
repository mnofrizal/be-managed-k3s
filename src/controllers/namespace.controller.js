import namespaceService from "../services/namespace.service.js";
import logger from "../config/logger.js";

export const getAllNamespaces = async (req, res) => {
  try {
    logger.info("Fetching all namespaces");
    const namespaces = await namespaceService.getAllNamespaces();

    logger.info(`Successfully retrieved ${namespaces.length} namespaces`);
    res.json({
      success: true,
      data: namespaces,
      count: namespaces.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch all namespaces", {
      error: error.message,
      stack: error.stack,
    });

    // Return appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes("Cannot connect to Kubernetes")) {
      statusCode = 502; // Bad Gateway
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

export const getNamespaceByName = async (req, res) => {
  try {
    const { name } = req.params;

    // Validate that name parameter exists
    if (!name || name.trim() === "") {
      logger.warn("Namespace name parameter is missing or empty", {
        params: req.params,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Namespace name parameter is required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`Fetching namespace by name: ${name}`);

    const namespace = await namespaceService.getNamespaceByName(name.trim());

    logger.info(`Successfully retrieved namespace: ${name}`);
    res.json({
      success: true,
      data: namespace,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Failed to fetch namespace: ${req.params.name}`, {
      namespaceName: req.params.name,
      error: error.message,
      stack: error.stack,
    });

    // Return appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes("not found")) {
      statusCode = 404; // Not Found
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
  getAllNamespaces,
  getNamespaceByName,
};
