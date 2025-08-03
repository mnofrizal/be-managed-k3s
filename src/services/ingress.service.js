import { KubeConfig, NetworkingV1Api } from "@kubernetes/client-node";
import logger from "../config/logger.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const networkingV1Api = kubeConfig.makeApiClient(NetworkingV1Api);

export const getAllIngresses = async (namespace = null) => {
  try {
    logger.debug("Calling Kubernetes API to list all ingresses", {
      namespace: namespace || "all namespaces",
    });

    let res;
    if (namespace) {
      res = await networkingV1Api.listNamespacedIngress(namespace);
    } else {
      res = await networkingV1Api.listIngressForAllNamespaces();
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
      throw new Error(
        "No ingresses found in cluster or invalid response format"
      );
    }

    logger.info(
      `Successfully processed ${responseData.items.length} ingresses from Kubernetes API`
    );
    return responseData.items;
  } catch (error) {
    logger.error("Failed to fetch ingresses from Kubernetes API", {
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

    throw new Error(`Failed to fetch ingresses: ${error.message}`);
  }
};

export default {
  getAllIngresses,
};
