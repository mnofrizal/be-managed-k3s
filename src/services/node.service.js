import { KubeConfig, CoreV1Api, Metrics } from "@kubernetes/client-node";
import logger from "../config/logger.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);
const metricsClient = new Metrics(kubeConfig);

// Helper function to get node metrics
const getNodeMetrics = async () => {
  try {
    const nodeMetrics = await metricsClient.getNodeMetrics();
    if (!nodeMetrics || !nodeMetrics.items) {
      return {};
    }

    // Create a map of node metrics by node name
    const metricsMap = {};
    nodeMetrics.items.forEach((nodeMetric) => {
      const nodeName = nodeMetric.metadata?.name;
      if (nodeName) {
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

        metricsMap[nodeName] = {
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
      }
    });

    return metricsMap;
  } catch (error) {
    logger.warn("Failed to fetch node metrics, continuing without metrics", {
      error: error.message,
    });
    return {};
  }
};

export const getAllNodes = async () => {
  try {
    logger.debug("Calling Kubernetes API to list all nodes");
    const res = await k8sApi.listNode();

    // Log the response structure for debugging
    logger.debug("Kubernetes API response received", {
      hasResponse: !!res,
      hasBody: !!res?.body,
      hasItems: !!res?.body?.items,
      itemsLength: res?.body?.items?.length,
      apiVersion: res?.body?.apiVersion,
      kind: res?.body?.kind,
    });

    // The response structure is correct - it's a direct object, not nested in body
    const responseData = res.body || res;

    if (
      !responseData ||
      !responseData.items ||
      !Array.isArray(responseData.items)
    ) {
      logger.error("Invalid response structure from Kubernetes API", {
        responseData: responseData,
        itemsType: typeof responseData?.items,
      });
      throw new Error("No nodes found in cluster or invalid response format");
    }

    // Get node metrics
    logger.debug("Fetching node metrics to include with node data");
    const nodeMetricsMap = await getNodeMetrics();

    // Get all pods to count pods per node
    logger.debug("Fetching all pods to count pods per node");
    let podsByNode = {};
    try {
      const podsRes = await k8sApi.listPodForAllNamespaces();
      const podsData = podsRes.body || podsRes;
      if (podsData && podsData.items) {
        podsData.items.forEach((pod) => {
          const nodeName = pod.spec?.nodeName;
          if (nodeName) {
            if (!podsByNode[nodeName]) {
              podsByNode[nodeName] = {
                total: 0,
                running: 0,
                pending: 0,
                failed: 0,
                succeeded: 0,
              };
            }
            podsByNode[nodeName].total++;

            const phase = pod.status?.phase;
            if (phase === "Running") {
              podsByNode[nodeName].running++;
            } else if (phase === "Pending") {
              podsByNode[nodeName].pending++;
            } else if (phase === "Failed") {
              podsByNode[nodeName].failed++;
            } else if (phase === "Succeeded") {
              podsByNode[nodeName].succeeded++;
            }
          }
        });
      }
    } catch (error) {
      logger.warn(
        "Failed to fetch pods for node pod count, continuing without pod counts",
        {
          error: error.message,
        }
      );
    }

    const nodes = responseData.items.map((node) => {
      const nodeName = node.metadata?.name;
      const nodeMetrics = nodeMetricsMap[nodeName] || null;

      const nodePods = podsByNode[nodeName] || {
        total: 0,
        running: 0,
        pending: 0,
        failed: 0,
        succeeded: 0,
      };

      return {
        name: nodeName,
        status: node.status?.conditions?.find((c) => c.type === "Ready")
          ?.status,
        roles: node.metadata?.labels
          ? Object.keys(node.metadata.labels).filter((key) =>
              key.includes("node-role.kubernetes.io")
            )
          : [],
        os: node.status?.nodeInfo?.osImage,
        kernelVersion: node.status?.nodeInfo?.kernelVersion,
        kubeletVersion: node.status?.nodeInfo?.kubeletVersion,
        containerRuntime: node.status?.nodeInfo?.containerRuntimeVersion,
        addresses: node.status?.addresses,
        capacity: node.status?.capacity,
        allocatable: node.status?.allocatable,
        pods: nodePods,
        creationTimestamp: node.metadata?.creationTimestamp,
        labels: node.metadata?.labels,
        annotations: node.metadata?.annotations,
        metrics: nodeMetrics,
      };
    });

    logger.info(
      `Successfully processed ${nodes.length} nodes from Kubernetes API with metrics`
    );
    return nodes;
  } catch (error) {
    logger.error("Failed to fetch nodes from Kubernetes API", {
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

    throw new Error(`Failed to fetch nodes: ${error.message}`);
  }
};

export const getNodeByName = async (name) => {
  try {
    // Validate input parameter
    if (!name || typeof name !== "string" || name.trim() === "") {
      logger.error("Invalid node name parameter", {
        name: name,
        type: typeof name,
      });
      throw new Error("Node name is required and must be a non-empty string");
    }

    const nodeName = name.trim();
    logger.debug(`Calling Kubernetes API to get node: ${nodeName}`, {
      nodeName: nodeName,
      nodeNameLength: nodeName.length,
      nodeNameType: typeof nodeName,
    });

    // Use the correct API call format - pass as object parameter
    const res = await k8sApi.readNode({ name: nodeName });

    // The response structure is correct - it's a direct object, not nested in body
    const responseData = res.body || res;

    if (!responseData) {
      logger.error(
        `Invalid response from Kubernetes API for node: ${nodeName}`,
        { response: res }
      );
      throw new Error("Invalid response from Kubernetes API");
    }

    const node = responseData;

    // Get node metrics
    logger.debug(`Fetching metrics for node: ${nodeName}`);
    const nodeMetricsMap = await getNodeMetrics();
    const nodeMetrics = nodeMetricsMap[nodeName] || null;

    // Get pods running on this specific node
    logger.debug(`Fetching pods for node: ${nodeName}`);
    let nodePods = {
      total: 0,
      running: 0,
      pending: 0,
      failed: 0,
      succeeded: 0,
    };
    try {
      const podsRes = await k8sApi.listPodForAllNamespaces();
      const podsData = podsRes.body || podsRes;
      if (podsData && podsData.items) {
        podsData.items.forEach((pod) => {
          if (pod.spec?.nodeName === nodeName) {
            nodePods.total++;

            const phase = pod.status?.phase;
            if (phase === "Running") {
              nodePods.running++;
            } else if (phase === "Pending") {
              nodePods.pending++;
            } else if (phase === "Failed") {
              nodePods.failed++;
            } else if (phase === "Succeeded") {
              nodePods.succeeded++;
            }
          }
        });
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch pods for node ${nodeName}, continuing without pod counts`,
        {
          error: error.message,
        }
      );
    }

    const nodeData = {
      name: node.metadata?.name,
      status: node.status?.conditions?.find((c) => c.type === "Ready")?.status,
      roles: node.metadata?.labels
        ? Object.keys(node.metadata.labels).filter((key) =>
            key.includes("node-role.kubernetes.io")
          )
        : [],
      os: node.status?.nodeInfo?.osImage,
      kernelVersion: node.status?.nodeInfo?.kernelVersion,
      kubeletVersion: node.status?.nodeInfo?.kubeletVersion,
      containerRuntime: node.status?.nodeInfo?.containerRuntimeVersion,
      addresses: node.status?.addresses,
      capacity: node.status?.capacity,
      allocatable: node.status?.allocatable,
      pods: nodePods,
      creationTimestamp: node.metadata?.creationTimestamp,
      labels: node.metadata?.labels,
      annotations: node.metadata?.annotations,
      metrics: nodeMetrics,
    };

    logger.info(
      `Successfully processed node data with metrics for: ${nodeName}`
    );
    return nodeData;
  } catch (error) {
    logger.error(`Failed to fetch node from Kubernetes API: ${name}`, {
      nodeName: name,
      error: error.message,
      stack: error.stack,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    // Check if it's a 404 error (node not found)
    if (error.statusCode === 404) {
      throw new Error(`Node '${name}' not found in the cluster`);
    }

    // Check if it's a connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    throw new Error(`Failed to fetch node ${name}: ${error.message}`);
  }
};

export default {
  getAllNodes,
  getNodeByName,
};
