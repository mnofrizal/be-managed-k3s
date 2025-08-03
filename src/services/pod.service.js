import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";
import logger from "../config/logger.js";
import { getPodMetrics } from "./pod/pod.metrics.js";
import { transformPodData } from "./pod/pod.transformer.js";
import {
  connectToPodTerminal as connectToTerminal,
  getPodLogs as getLogs,
  streamPodLogs as streamLogs,
} from "./pod/pod.interaction.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);

export const getAllPods = async (namespace = null) => {
  try {
    logger.debug("Calling Kubernetes API to list all pods", {
      namespace: namespace || "all namespaces",
    });

    let res;
    if (namespace) {
      res = await k8sApi.listNamespacedPod({ namespace });
    } else {
      res = await k8sApi.listPodForAllNamespaces();
    }

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
      throw new Error("No pods found in cluster or invalid response format");
    }

    logger.debug("Fetching pod metrics to include with pod data");
    let podMetricsMap = {};
    try {
      podMetricsMap = await getPodMetrics(kubeConfig);
    } catch (metricsError) {
      logger.warn("Failed to fetch pod metrics, continuing without metrics", {
        error: metricsError.message,
      });
    }

    const pods = responseData.items.map((pod) =>
      transformPodData(pod, podMetricsMap)
    );

    logger.info(
      `Successfully processed ${pods.length} pods from Kubernetes API`
    );
    return pods;
  } catch (error) {
    logger.error("Failed to fetch pods from Kubernetes API", {
      error: error.message,
      stack: error.stack,
      namespace: namespace,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    if (error.statusCode === 404 && namespace) {
      throw new Error(`Namespace '${namespace}' not found`);
    }

    throw new Error(`Failed to fetch pods: ${error.message}`);
  }
};

export const getPodByName = async (name, namespace = "default") => {
  try {
    if (!name || typeof name !== "string" || name.trim() === "") {
      throw new Error("Pod name is required and must be a non-empty string");
    }

    if (
      !namespace ||
      typeof namespace !== "string" ||
      namespace.trim() === ""
    ) {
      throw new Error("Namespace is required and must be a non-empty string");
    }

    const podName = name.trim();
    const namespaceName = namespace.trim();

    logger.debug(
      `Calling Kubernetes API to get pod: ${podName} in namespace: ${namespaceName}`,
      {
        podName: podName,
        namespace: namespaceName,
      }
    );

    // Get specific pod from namespace
    const res = await k8sApi.readNamespacedPod({
      name: podName,
      namespace: namespaceName,
    });
    const pod = res.body || res;

    if (!pod) {
      throw new Error("Invalid response from Kubernetes API");
    }

    logger.debug(
      `Fetching metrics for pod: ${podName} in namespace: ${namespaceName}`
    );
    let podMetricsMap = {};
    try {
      podMetricsMap = await getPodMetrics(kubeConfig);
    } catch (metricsError) {
      logger.warn("Failed to fetch pod metrics, continuing without metrics", {
        error: metricsError.message,
      });
    }

    const podData = transformPodData(pod, podMetricsMap);

    logger.info(`Successfully processed pod data for: ${podName}`);
    return podData;
  } catch (error) {
    logger.error(`Failed to fetch pod from Kubernetes API: ${name}`, {
      podName: name,
      namespace: namespace,
      error: error.message,
      stack: error.stack,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    if (error.statusCode === 404) {
      throw new Error(`Pod '${name}' not found in namespace '${namespace}'`);
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    throw new Error(`Failed to fetch pod ${name}: ${error.message}`);
  }
};

export const getPodsByNamespace = async (namespace) => {
  if (!namespace || typeof namespace !== "string" || namespace.trim() === "") {
    throw new Error("Namespace is required and must be a non-empty string");
  }
  return getAllPods(namespace.trim());
};

export const connectToPodTerminal = (
  clientWs,
  namespace,
  podName,
  containerName,
  shell
) => {
  return connectToTerminal(
    clientWs,
    kubeConfig,
    k8sApi,
    namespace,
    podName,
    containerName,
    shell
  );
};

export const getPodLogs = (namespace, podName, containerName) => {
  return getLogs(k8sApi, namespace, podName, containerName);
};

export const streamPodLogs = (clientWs, namespace, podName, containerName) => {
  return streamLogs(
    clientWs,
    kubeConfig,
    k8sApi,
    namespace,
    podName,
    containerName
  );
};

export default {
  getAllPods,
  getPodByName,
  getPodsByNamespace,
  connectToPodTerminal,
  getPodLogs,
  streamPodLogs,
};
