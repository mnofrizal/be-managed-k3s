import { Metrics } from "@kubernetes/client-node";
import logger from "../../config/logger.js";

// Helper function to get pod metrics
export const getPodMetrics = async (kubeConfig) => {
  const metricsClient = new Metrics(kubeConfig);
  try {
    const podMetrics = await metricsClient.getPodMetrics();
    if (!podMetrics || !podMetrics.items) {
      return {};
    }

    // Create a map of pod metrics by pod name and namespace
    const metricsMap = {};
    podMetrics.items.forEach((podMetric) => {
      const podName = podMetric.metadata?.name;
      const podNamespace = podMetric.metadata?.namespace;
      if (podName && podNamespace) {
        const key = `${podNamespace}/${podName}`;

        // Calculate total CPU and memory usage for all containers in the pod
        let totalCpuUsage = 0;
        let totalMemoryUsage = 0;
        let cpuUsageRaw = "";
        let memoryUsageRaw = "";

        if (podMetric.containers) {
          podMetric.containers.forEach((container) => {
            const cpuUsage = container.usage?.cpu || "0";
            const memoryUsage = container.usage?.memory || "0";

            // Store raw values for the first container (or combine them)
            if (!cpuUsageRaw) {
              cpuUsageRaw = cpuUsage;
              memoryUsageRaw = memoryUsage;
            }

            // Convert CPU from nanocores to millicores with decimal precision
            const cpuMillicores = cpuUsage.endsWith("n")
              ? parseFloat(
                  (parseInt(cpuUsage.slice(0, -1)) / 1000000).toFixed(2)
                )
              : parseFloat(cpuUsage) || 0;

            // Convert memory from Ki to bytes
            const memoryBytes = memoryUsage.endsWith("Ki")
              ? parseInt(memoryUsage.slice(0, -2)) * 1024
              : parseInt(memoryUsage) || 0;

            totalCpuUsage += cpuMillicores;
            totalMemoryUsage += memoryBytes;
          });
        }

        metricsMap[key] = {
          timestamp: podMetric.timestamp,
          window: podMetric.window,
          usage: {
            cpu: {
              raw: cpuUsageRaw || "0n",
              millicores: parseFloat(totalCpuUsage.toFixed(2)),
              cores: parseFloat((totalCpuUsage / 1000).toFixed(2)),
            },
            memory: {
              raw: memoryUsageRaw || "0Ki",
              bytes: totalMemoryUsage,
              megabytes: parseFloat(
                (totalMemoryUsage / (1024 * 1024)).toFixed(1)
              ),
              gigabytes: parseFloat(
                (totalMemoryUsage / (1024 * 1024 * 1024)).toFixed(1)
              ),
            },
          },
        };
      }
    });

    return metricsMap;
  } catch (error) {
    logger.warn("Failed to fetch pod metrics, continuing without metrics", {
      error: error.message,
    });
    return {};
  }
};
