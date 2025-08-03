import serviceService from "../services/service.service.js";
import logger from "../config/logger.js";

export const getAllServices = async (req, res) => {
  try {
    const { namespace } = req.query;

    logger.info("Fetching all services", {
      namespace: namespace || "all namespaces",
    });

    const services = await serviceService.getAllServices(namespace);

    logger.info(`Successfully retrieved ${services.length} services`);
    res.json({
      success: true,
      data: services,
      count: services.length,
      namespace: namespace || "all",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch all services", {
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
  getAllServices,
};
