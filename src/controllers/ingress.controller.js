import ingressService from "../services/ingress.service.js";
import logger from "../config/logger.js";

export const getAllIngresses = async (req, res) => {
  try {
    const { namespace } = req.query;

    logger.info("Fetching all ingresses", {
      namespace: namespace || "all namespaces",
    });

    const ingresses = await ingressService.getAllIngresses(namespace);

    logger.info(`Successfully retrieved ${ingresses.length} ingresses`);
    res.json({
      success: true,
      data: ingresses,
      count: ingresses.length,
      namespace: namespace || "all",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch all ingresses", {
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

export default {
  getAllIngresses,
};
