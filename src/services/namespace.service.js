import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";
import logger from "../config/logger.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);

export const getAllNamespaces = async () => {
  try {
    logger.debug("Calling Kubernetes API to list all namespaces");
    const res = await k8sApi.listNamespace();

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
      throw new Error(
        "No namespaces found in cluster or invalid response format"
      );
    }

    // Get all pods to count pods per namespace
    logger.debug("Fetching all pods to count pods per namespace");
    let podsByNamespace = {};
    try {
      const podsRes = await k8sApi.listPodForAllNamespaces();
      const podsData = podsRes.body || podsRes;
      if (podsData && podsData.items) {
        podsData.items.forEach((pod) => {
          const namespaceName = pod.metadata?.namespace;
          if (namespaceName) {
            if (!podsByNamespace[namespaceName]) {
              podsByNamespace[namespaceName] = {
                total: 0,
                running: 0,
                pending: 0,
                failed: 0,
                succeeded: 0,
              };
            }
            podsByNamespace[namespaceName].total++;

            const phase = pod.status?.phase;
            if (phase === "Running") {
              podsByNamespace[namespaceName].running++;
            } else if (phase === "Pending") {
              podsByNamespace[namespaceName].pending++;
            } else if (phase === "Failed") {
              podsByNamespace[namespaceName].failed++;
            } else if (phase === "Succeeded") {
              podsByNamespace[namespaceName].succeeded++;
            }
          }
        });
      }
    } catch (error) {
      logger.warn(
        "Failed to fetch pods for namespace pod count, continuing without pod counts",
        {
          error: error.message,
        }
      );
    }

    const namespaces = responseData.items.map((namespace) => {
      const namespaceName = namespace.metadata?.name;
      const namespacePods = podsByNamespace[namespaceName] || {
        total: 0,
        running: 0,
        pending: 0,
        failed: 0,
        succeeded: 0,
      };

      return {
        name: namespaceName,
        status: namespace.status?.phase || "Active",
        creationTimestamp: namespace.metadata?.creationTimestamp,
        labels: namespace.metadata?.labels || {},
        annotations: namespace.metadata?.annotations || {},
        pods: namespacePods,
        uid: namespace.metadata?.uid,
        resourceVersion: namespace.metadata?.resourceVersion,
      };
    });

    logger.info(
      `Successfully processed ${namespaces.length} namespaces from Kubernetes API`
    );
    return namespaces;
  } catch (error) {
    logger.error("Failed to fetch namespaces from Kubernetes API", {
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

    throw new Error(`Failed to fetch namespaces: ${error.message}`);
  }
};

export const getNamespaceByName = async (name) => {
  try {
    // Validate input parameter
    if (!name || typeof name !== "string" || name.trim() === "") {
      logger.error("Invalid namespace name parameter", {
        name: name,
        type: typeof name,
      });
      throw new Error(
        "Namespace name is required and must be a non-empty string"
      );
    }

    const namespaceName = name.trim();
    logger.debug(`Calling Kubernetes API to get namespace: ${namespaceName}`, {
      namespaceName: namespaceName,
    });

    // Get specific namespace
    const res = await k8sApi.readNamespace({
      name: namespaceName,
    });

    // The response structure is correct - it's a direct object, not nested in body
    const responseData = res.body || res;

    if (!responseData) {
      logger.error(
        `Invalid response from Kubernetes API for namespace: ${namespaceName}`,
        {
          response: res,
        }
      );
      throw new Error("Invalid response from Kubernetes API");
    }

    const namespace = responseData;

    // Get pods in this specific namespace
    logger.debug(`Fetching pods for namespace: ${namespaceName}`);
    let namespacePods = {
      total: 0,
      running: 0,
      pending: 0,
      failed: 0,
      succeeded: 0,
    };
    try {
      const podsRes = await k8sApi.listNamespacedPod({
        namespace: namespaceName,
      });
      const podsData = podsRes.body || podsRes;
      if (podsData && podsData.items) {
        podsData.items.forEach((pod) => {
          namespacePods.total++;

          const phase = pod.status?.phase;
          if (phase === "Running") {
            namespacePods.running++;
          } else if (phase === "Pending") {
            namespacePods.pending++;
          } else if (phase === "Failed") {
            namespacePods.failed++;
          } else if (phase === "Succeeded") {
            namespacePods.succeeded++;
          }
        });
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch pods for namespace ${namespaceName}, continuing without pod counts`,
        {
          error: error.message,
        }
      );
    }

    const namespaceData = {
      name: namespace.metadata?.name,
      status: namespace.status?.phase || "Active",
      creationTimestamp: namespace.metadata?.creationTimestamp,
      labels: namespace.metadata?.labels || {},
      annotations: namespace.metadata?.annotations || {},
      pods: namespacePods,
      uid: namespace.metadata?.uid,
      resourceVersion: namespace.metadata?.resourceVersion,
    };

    logger.info(`Successfully processed namespace data for: ${namespaceName}`);
    return namespaceData;
  } catch (error) {
    logger.error(`Failed to fetch namespace from Kubernetes API: ${name}`, {
      namespaceName: name,
      error: error.message,
      stack: error.stack,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    // Check if it's a 404 error (namespace not found)
    if (error.statusCode === 404) {
      throw new Error(`Namespace '${name}' not found in the cluster`);
    }

    // Check if it's a connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    throw new Error(`Failed to fetch namespace ${name}: ${error.message}`);
  }
};

export default {
  getAllNamespaces,
  getNamespaceByName,
};
