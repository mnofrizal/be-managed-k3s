import {
  KubeConfig,
  CoreV1Api,
  VersionApi,
  Metrics,
} from "@kubernetes/client-node";
import logger from "../config/logger.js";
import os from "os";
import path from "path";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);
const versionApi = kubeConfig.makeApiClient(VersionApi);
const metricsClient = new Metrics(kubeConfig);

// Get the actual kubeconfig path
const getKubeconfigPath = () => {
  const kubeconfigEnv = process.env.KUBECONFIG;
  if (kubeconfigEnv) {
    return `Kubeconfig: ${kubeconfigEnv}`;
  }
  const defaultPath = path.join(os.homedir(), ".kube", "config");
  return `Kubeconfig: ${defaultPath}`;
};

// Helper function to get cluster metrics
const getClusterMetrics = async (nodes, pods) => {
  try {
    // Get node metrics
    const nodeMetrics = await metricsClient.getNodeMetrics();
    const podMetrics = await metricsClient.getPodMetrics();

    let totalCpuUsageRaw = "";
    let totalCpuUsage = 0;
    let totalMemoryUsageRaw = "";
    let totalMemoryUsage = 0;
    let totalCpuCapacity = 0;
    let totalMemoryCapacity = 0;
    let timestamp = new Date().toISOString();
    let window = "20.022s";

    // Calculate total CPU and memory usage from node metrics
    if (nodeMetrics && nodeMetrics.items) {
      nodeMetrics.items.forEach((nodeMetric) => {
        const cpuUsage = nodeMetric.usage?.cpu || "0";
        const memoryUsage = nodeMetric.usage?.memory || "0";

        // Store raw values for the first node (or combine them)
        if (!totalCpuUsageRaw) {
          totalCpuUsageRaw = cpuUsage;
          totalMemoryUsageRaw = memoryUsage;
          timestamp = nodeMetric.timestamp || timestamp;
          window = nodeMetric.window || window;
        }

        // Convert CPU from nanocores to millicores
        const cpuMillicores = cpuUsage.endsWith("n")
          ? Math.round(parseInt(cpuUsage.slice(0, -1)) / 1000000)
          : parseInt(cpuUsage) || 0;

        // Convert memory from Ki to bytes
        const memoryBytes = memoryUsage.endsWith("Ki")
          ? parseInt(memoryUsage.slice(0, -2)) * 1024
          : parseInt(memoryUsage) || 0;

        totalCpuUsage += cpuMillicores;
        totalMemoryUsage += memoryBytes;
      });
    }

    // Calculate total capacity from nodes
    if (nodes && nodes.length > 0) {
      nodes.forEach((node) => {
        const cpuCapacity = node.status?.capacity?.cpu || "0";
        const memoryCapacity = node.status?.capacity?.memory || "0";

        // Convert CPU capacity to millicores
        const cpuCapacityMillicores = parseInt(cpuCapacity) * 1000 || 0;

        // Convert memory capacity from Ki to bytes
        const memoryCapacityBytes = memoryCapacity.endsWith("Ki")
          ? parseInt(memoryCapacity.slice(0, -2)) * 1024
          : parseInt(memoryCapacity) || 0;

        totalCpuCapacity += cpuCapacityMillicores;
        totalMemoryCapacity += memoryCapacityBytes;
      });
    }

    // Use the actual total pods count from the cluster, not just from metrics
    const totalPods = pods ? pods.length : 0;

    return {
      timestamp: timestamp,
      window: window,
      usage: {
        cpu: {
          raw: totalCpuUsageRaw || "0n",
          millicores: totalCpuUsage,
          cores: Math.round((totalCpuUsage / 1000) * 100) / 100,
        },
        memory: {
          raw: totalMemoryUsageRaw || "0Ki",
          bytes: totalMemoryUsage,
          megabytes: Math.round((totalMemoryUsage / (1024 * 1024)) * 100) / 100,
          gigabytes:
            Math.round((totalMemoryUsage / (1024 * 1024 * 1024)) * 100) / 100,
        },
      },
      capacity: {
        cpu: {
          millicores: totalCpuCapacity,
          cores: Math.round((totalCpuCapacity / 1000) * 100) / 100,
        },
        memory: {
          bytes: totalMemoryCapacity,
          megabytes:
            Math.round((totalMemoryCapacity / (1024 * 1024)) * 100) / 100,
          gigabytes:
            Math.round((totalMemoryCapacity / (1024 * 1024 * 1024)) * 100) /
            100,
        },
      },
      totalPods: totalPods,
    };
  } catch (error) {
    logger.warn("Failed to fetch cluster metrics, returning default values", {
      error: error.message,
    });
    return {
      timestamp: new Date().toISOString(),
      window: "0s",
      usage: {
        cpu: {
          raw: "0n",
          millicores: 0,
          cores: 0,
        },
        memory: {
          raw: "0Ki",
          bytes: 0,
          megabytes: 0,
          gigabytes: 0,
        },
      },
      capacity: {
        cpu: {
          millicores: 0,
          cores: 0,
        },
        memory: {
          bytes: 0,
          megabytes: 0,
          gigabytes: 0,
        },
      },
      totalPods: 0,
    };
  }
};

export const getAllClusters = async () => {
  try {
    logger.debug("Calling Kubernetes API to get cluster information");

    // Get cluster version information
    const versionResponse = await versionApi.getCode();
    const versionData = versionResponse.body || versionResponse;

    // Get current context information
    const currentContext = kubeConfig.getCurrentContext();
    const contexts = kubeConfig.getContexts();
    const currentContextObj =
      contexts && contexts.contexts
        ? contexts.contexts.find((ctx) => ctx.name === currentContext)
        : null;

    // Get cluster information from kubeconfig
    const clusters = kubeConfig.getClusters();

    // Get namespaces to show cluster activity
    const namespacesResponse = await k8sApi.listNamespace();
    const namespaces =
      namespacesResponse.body?.items || namespacesResponse.items || [];

    // Get nodes count for cluster overview
    const nodesResponse = await k8sApi.listNode();
    const nodes = nodesResponse.body?.items || nodesResponse.items || [];

    // Get pods count for cluster overview
    const podsResponse = await k8sApi.listPodForAllNamespaces();
    const pods = podsResponse.body?.items || podsResponse.items || [];

    // Get cluster metrics
    const clusterMetrics = await getClusterMetrics(nodes, pods);

    // Since we can successfully call the API, we know we're connected to a cluster
    // Let's identify the current cluster by matching the server URL or assume the first one is current
    const currentClusterName = currentContextObj?.cluster || clusters[0]?.name;

    // Build cluster information
    const clusterInfo = clusters.map((cluster) => {
      const isCurrentCluster =
        cluster.name === currentClusterName || clusters.length === 1;

      return {
        name: cluster.name,
        server: cluster.server,
        origin: getKubeconfigPath(),
        isCurrent: isCurrentCluster,
        context: isCurrentCluster
          ? currentContext
          : `context-for-${cluster.name}`,
        version: isCurrentCluster
          ? {
              major: versionData.major,
              minor: versionData.minor,
              gitVersion: versionData.gitVersion,
              gitCommit: versionData.gitCommit,
              gitTreeState: versionData.gitTreeState,
              buildDate: versionData.buildDate,
              goVersion: versionData.goVersion,
              compiler: versionData.compiler,
              platform: versionData.platform,
            }
          : {
              major: "Unknown",
              minor: "Unknown",
              gitVersion: "Not connected",
              gitCommit: "N/A",
              gitTreeState: "N/A",
              buildDate: "N/A",
              goVersion: "N/A",
              compiler: "N/A",
              platform: "N/A",
            },
        stats: isCurrentCluster
          ? {
              totalNodes: nodes.length,
              totalNamespaces: namespaces.length,
              totalPods: pods.length,
              readyNodes: nodes.filter(
                (node) =>
                  node.status?.conditions?.find((c) => c.type === "Ready")
                    ?.status === "True"
              ).length,
              runningPods: pods.filter((pod) => pod.status?.phase === "Running")
                .length,
              pendingPods: pods.filter((pod) => pod.status?.phase === "Pending")
                .length,
              failedPods: pods.filter((pod) => pod.status?.phase === "Failed")
                .length,
              succeededPods: pods.filter(
                (pod) => pod.status?.phase === "Succeeded"
              ).length,
              unknownPods: pods.filter((pod) => pod.status?.phase === "Unknown")
                .length,
            }
          : {
              totalNodes: 0,
              totalNamespaces: 0,
              totalPods: 0,
              readyNodes: 0,
              runningPods: 0,
              pendingPods: 0,
              failedPods: 0,
              succeededPods: 0,
              unknownPods: 0,
            },
        metrics: isCurrentCluster
          ? clusterMetrics
          : {
              timestamp: new Date().toISOString(),
              window: "0s",
              usage: {
                cpu: { raw: "0n", millicores: 0, cores: 0 },
                memory: { raw: "0Ki", bytes: 0, megabytes: 0, gigabytes: 0 },
              },
              capacity: {
                cpu: { millicores: 0, cores: 0 },
                memory: { bytes: 0, megabytes: 0, gigabytes: 0 },
              },
              totalPods: 0,
            },
        namespaces: isCurrentCluster
          ? namespaces.map((ns) => ({
              name: ns.metadata?.name,
              status: ns.status?.phase,
              creationTimestamp: ns.metadata?.creationTimestamp,
              labels: ns.metadata?.labels,
            }))
          : [],
      };
    });

    logger.info(
      `Successfully processed ${clusterInfo.length} cluster(s) information`
    );
    return clusterInfo;
  } catch (error) {
    logger.error("Failed to fetch cluster information from Kubernetes API", {
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

    throw new Error(`Failed to fetch cluster information: ${error.message}`);
  }
};

export const getClusterByName = async (name) => {
  try {
    // Validate input parameter
    if (!name || typeof name !== "string" || name.trim() === "") {
      logger.error("Invalid cluster name parameter", {
        name: name,
        type: typeof name,
      });
      throw new Error(
        "Cluster name is required and must be a non-empty string"
      );
    }

    const clusterName = name.trim();
    logger.debug(`Getting cluster information for: ${clusterName}`);

    // Get all clusters and find the specific one
    const clusters = await getAllClusters();
    const cluster = clusters.find((c) => c.name === clusterName);

    if (!cluster) {
      throw new Error(`Cluster '${clusterName}' not found`);
    }

    logger.info(
      `Successfully retrieved cluster information for: ${clusterName}`
    );
    return cluster;
  } catch (error) {
    logger.error(`Failed to fetch cluster information: ${name}`, {
      clusterName: name,
      error: error.message,
      stack: error.stack,
    });

    throw new Error(`Failed to fetch cluster ${name}: ${error.message}`);
  }
};

export default {
  getAllClusters,
  getClusterByName,
};
