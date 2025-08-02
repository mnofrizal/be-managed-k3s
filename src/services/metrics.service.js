import { KubeConfig, Metrics } from "@kubernetes/client-node";
import logger from "../config/logger.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const metricsClient = new Metrics(kubeConfig);

export const getAllNodeMetrics = async () => {
  try {
    logger.debug("Calling Kubernetes Metrics API to get all node metrics");

    // Get node metrics from Kubernetes Metrics API
    const nodeMetrics = await metricsClient.getNodeMetrics();

    logger.debug("Kubernetes Metrics API response received", {
      hasMetrics: !!nodeMetrics,
      metricsLength: nodeMetrics?.items?.length,
      apiVersion: nodeMetrics?.apiVersion,
      kind: nodeMetrics?.kind,
    });

    if (
      !nodeMetrics ||
      !nodeMetrics.items ||
      !Array.isArray(nodeMetrics.items)
    ) {
      logger.error("Invalid response structure from Kubernetes Metrics API", {
        nodeMetrics: nodeMetrics,
        itemsType: typeof nodeMetrics?.items,
      });
      throw new Error("No node metrics found or invalid response format");
    }

    const metrics = nodeMetrics.items.map((nodeMetric) => {
      const cpuUsage = nodeMetric.usage?.cpu || "0";
      const memoryUsage = nodeMetric.usage?.memory || "0";

      // Convert CPU from nanocores to millicores for better readability
      const cpuMillicores = cpuUsage.endsWith("n")
        ? Math.round(parseInt(cpuUsage.slice(0, -1)) / 1000000)
        : cpuUsage;

      // Convert memory from Ki to bytes for consistency
      const memoryBytes = memoryUsage.endsWith("Ki")
        ? parseInt(memoryUsage.slice(0, -2)) * 1024
        : memoryUsage;

      return {
        nodeName: nodeMetric.metadata?.name,
        timestamp: nodeMetric.timestamp,
        window: nodeMetric.window,
        usage: {
          cpu: {
            raw: cpuUsage,
            millicores: cpuMillicores,
            cores: Math.round((cpuMillicores / 1000) * 100) / 100,
          },
          memory: {
            raw: memoryUsage,
            bytes: memoryBytes,
            megabytes: Math.round((memoryBytes / (1024 * 1024)) * 100) / 100,
            gigabytes:
              Math.round((memoryBytes / (1024 * 1024 * 1024)) * 100) / 100,
          },
        },
      };
    });

    logger.info(
      `Successfully processed ${metrics.length} node metrics from Kubernetes Metrics API`
    );
    return metrics;
  } catch (error) {
    logger.error("Failed to fetch node metrics from Kubernetes Metrics API", {
      error: error.message,
      stack: error.stack,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    // Check if it's a Kubernetes connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    // Check if metrics server is not available
    if (error.statusCode === 404) {
      throw new Error(
        "Metrics server is not available in the cluster. Please install metrics-server."
      );
    }

    throw new Error(`Failed to fetch node metrics: ${error.message}`);
  }
};

export const getNodeMetricsByName = async (name) => {
  try {
    // Validate input parameter
    if (!name || typeof name !== "string" || name.trim() === "") {
      logger.error("Invalid node name parameter for metrics", {
        name: name,
        type: typeof name,
      });
      throw new Error("Node name is required and must be a non-empty string");
    }

    const nodeName = name.trim();
    logger.debug(
      `Calling Kubernetes Metrics API to get metrics for node: ${nodeName}`
    );

    // Get specific node metrics
    const nodeMetrics = await metricsClient.getNodeMetrics(nodeName);

    if (!nodeMetrics) {
      logger.error(`No metrics found for node: ${nodeName}`);
      throw new Error(`No metrics found for node: ${nodeName}`);
    }

    const cpuUsage = nodeMetrics.usage?.cpu || "0";
    const memoryUsage = nodeMetrics.usage?.memory || "0";

    // Convert CPU from nanocores to millicores for better readability
    const cpuMillicores = cpuUsage.endsWith("n")
      ? Math.round(parseInt(cpuUsage.slice(0, -1)) / 1000000)
      : cpuUsage;

    // Convert memory from Ki to bytes for consistency
    const memoryBytes = memoryUsage.endsWith("Ki")
      ? parseInt(memoryUsage.slice(0, -2)) * 1024
      : memoryUsage;

    const metrics = {
      nodeName: nodeMetrics.metadata?.name,
      timestamp: nodeMetrics.timestamp,
      window: nodeMetrics.window,
      usage: {
        cpu: {
          raw: cpuUsage,
          millicores: cpuMillicores,
          cores: Math.round((cpuMillicores / 1000) * 100) / 100,
        },
        memory: {
          raw: memoryUsage,
          bytes: memoryBytes,
          megabytes: Math.round((memoryBytes / (1024 * 1024)) * 100) / 100,
          gigabytes:
            Math.round((memoryBytes / (1024 * 1024 * 1024)) * 100) / 100,
        },
      },
    };

    logger.info(`Successfully processed metrics for node: ${nodeName}`);
    return metrics;
  } catch (error) {
    logger.error(`Failed to fetch metrics for node: ${name}`, {
      nodeName: name,
      error: error.message,
      stack: error.stack,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    // Check if it's a 404 error (node not found)
    if (error.statusCode === 404) {
      throw new Error(`Node '${name}' not found or no metrics available`);
    }

    // Check if it's a connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    throw new Error(
      `Failed to fetch metrics for node ${name}: ${error.message}`
    );
  }
};

export default {
  getAllNodeMetrics,
  getNodeMetricsByName,
};
