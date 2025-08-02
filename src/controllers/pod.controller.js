import podService from "../services/pod.service.js";
import logger from "../config/logger.js";

export const getAllPods = async (req, res) => {
  try {
    const { namespace } = req.query;

    logger.info("Fetching all pods", {
      namespace: namespace || "all namespaces",
    });

    const pods = await podService.getAllPods(namespace);

    logger.info(`Successfully retrieved ${pods.length} pods`);
    res.json({
      success: true,
      data: pods,
      count: pods.length,
      namespace: namespace || "all",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch all pods", {
      error: error.message,
      stack: error.stack,
      namespace: req.query.namespace,
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

export const getPodByName = async (req, res) => {
  try {
    const { name } = req.params;
    const { namespace = "default" } = req.query;

    // Validate that name parameter exists
    if (!name || name.trim() === "") {
      logger.warn("Pod name parameter is missing or empty", {
        params: req.params,
        query: req.query,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Pod name parameter is required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`Fetching pod by name: ${name} in namespace: ${namespace}`);

    const pod = await podService.getPodByName(name.trim(), namespace);

    logger.info(`Successfully retrieved pod: ${name}`);
    res.json({
      success: true,
      data: pod,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Failed to fetch pod: ${req.params.name}`, {
      podName: req.params.name,
      namespace: req.query.namespace,
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

export const getPodsByNamespace = async (req, res) => {
  try {
    const { namespace } = req.params;

    // Validate that namespace parameter exists
    if (!namespace || namespace.trim() === "") {
      logger.warn("Namespace parameter is missing or empty", {
        params: req.params,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Namespace parameter is required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`Fetching pods by namespace: ${namespace}`);

    const pods = await podService.getPodsByNamespace(namespace.trim());

    logger.info(
      `Successfully retrieved ${pods.length} pods from namespace: ${namespace}`
    );
    res.json({
      success: true,
      data: pods,
      count: pods.length,
      namespace: namespace,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      `Failed to fetch pods from namespace: ${req.params.namespace}`,
      {
        namespace: req.params.namespace,
        error: error.message,
        stack: error.stack,
      }
    );

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
  getAllPods,
  getPodByName,
  getPodsByNamespace,
};
