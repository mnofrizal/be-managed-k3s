import { KubeConfig, AppsV1Api, CoreV1Api } from "@kubernetes/client-node";
import logger from "../config/logger.js";
import { streamPodLogs } from "./pod/pod.interaction.js";
import { createService } from "./service.service.js";
import { createIngress } from "./ingress.service.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const appsV1Api = kubeConfig.makeApiClient(AppsV1Api);
const coreV1Api = kubeConfig.makeApiClient(CoreV1Api);

export const getAllDeployments = async (namespace = null) => {
  try {
    logger.debug("Calling Kubernetes API to list all deployments", {
      namespace: namespace || "all namespaces",
    });

    let res;
    if (namespace) {
      res = await appsV1Api.listNamespacedDeployment({ namespace });
    } else {
      res = await appsV1Api.listDeploymentForAllNamespaces();
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
        "No deployments found in cluster or invalid response format"
      );
    }

    logger.info(
      `Successfully processed ${responseData.items.length} deployments from Kubernetes API`
    );
    return responseData.items;
  } catch (error) {
    logger.error("Failed to fetch deployments from Kubernetes API", {
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

    throw new Error(`Failed to fetch deployments: ${error.message}`);
  }
};

export const getDeploymentByName = async (name, namespace = "default") => {
  try {
    if (!name || typeof name !== "string" || name.trim() === "") {
      throw new Error(
        "Deployment name is required and must be a non-empty string"
      );
    }

    if (
      !namespace ||
      typeof namespace !== "string" ||
      namespace.trim() === ""
    ) {
      throw new Error("Namespace is required and must be a non-empty string");
    }

    const deploymentName = name.trim();
    const namespaceName = namespace.trim();

    logger.debug(
      `Calling Kubernetes API to get deployment: ${deploymentName} in namespace: ${namespaceName}`
    );

    const res = await appsV1Api.readNamespacedDeployment({
      name: deploymentName,
      namespace: namespaceName,
    });
    const deployment = res.body || res;

    if (!deployment) {
      throw new Error("Invalid response from Kubernetes API");
    }

    logger.info(
      `Successfully processed deployment data for: ${deploymentName}`
    );
    return deployment;
  } catch (error) {
    logger.error(`Failed to fetch deployment from Kubernetes API: ${name}`, {
      deploymentName: name,
      namespace: namespace,
      error: error.message,
      stack: error.stack,
      kubeConfigContext: kubeConfig.getCurrentContext(),
    });

    if (error.statusCode === 404) {
      throw new Error(
        `Deployment '${name}' not found in namespace '${namespace}'`
      );
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    throw new Error(`Failed to fetch deployment ${name}: ${error.message}`);
  }
};

export const getDeploymentPods = async (name, namespace = "default") => {
  try {
    const deployment = await getDeploymentByName(name, namespace);
    const labelSelector = Object.entries(deployment.spec.selector.matchLabels)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");

    const res = await coreV1Api.listNamespacedPod({
      namespace,
      labelSelector,
    });

    const resData = res.body || res;

    return resData.items;
  } catch (error) {
    logger.error(
      `Failed to get pods for deployment ${name}: ${error.message}`,
      {
        deploymentName: name,
        namespace: namespace,
        error: error.message,
        stack: error.stack,
      }
    );
    throw error;
  }
};

export const streamDeploymentLogs = async (
  clientWs,
  namespace,
  deploymentName
) => {
  try {
    const pods = await getDeploymentPods(deploymentName, namespace);
    if (pods.length === 0) {
      throw new Error(`No pods found for deployment ${deploymentName}`);
    }
    // For simplicity, we'll stream logs from the first pod.
    // A more robust solution might involve aggregating logs from all pods.
    const pod = pods[0];
    return streamPodLogs(
      clientWs,
      kubeConfig,
      coreV1Api,
      namespace,
      pod.metadata.name,
      pod.spec.containers[0].name
    );
  } catch (error) {
    logger.error(
      `Failed to stream logs for deployment ${deploymentName}: ${error.message}`,
      {
        deploymentName: deploymentName,
        namespace: namespace,
        error: error.message,
        stack: error.stack,
      }
    );
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close(1011, `Error setting up log stream: ${error.message}`);
    }
  }
};
export const createDeployment = async (
  namespace,
  deploymentBody,
  serviceBody,
  ingressBody
) => {
  try {
    logger.debug(
      `Calling Kubernetes API to create deployment in namespace: ${namespace}`
    );

    const deployment = await appsV1Api.createNamespacedDeployment({
      namespace,
      body: deploymentBody,
    });
    logger.info(`Successfully created deployment`);

    let service;
    if (serviceBody) {
      service = await createService(namespace, serviceBody);
      logger.info(`Successfully created service`);
    }

    let ingress;
    if (ingressBody) {
      ingress = await createIngress(namespace, ingressBody);
      logger.info(`Successfully created ingress`);
    }

    return {
      deployment: deployment.body,
      service: service,
      ingress: ingress,
    };
  } catch (error) {
    logger.error(`Failed to create deployment: ${error.message}`, {
      namespace: namespace,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};
export const restartDeployment = async (name, namespace = "default") => {
  try {
    logger.debug(
      `Calling Kubernetes API to restart deployment: ${name} in namespace: ${namespace}`
    );

    const patch = [
      {
        op: "replace",
        path: "/spec/template/metadata/annotations",
        value: {
          "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
        },
      },
    ];

    const options = {
      headers: { "Content-type": "application/json-patch+json" },
    };

    const res = await appsV1Api.patchNamespacedDeployment(
      {
        name,
        namespace,
        body: patch,
      },
      options
    );

    logger.info(`Successfully restarted deployment: ${name}`);
    return res.body;
  } catch (error) {
    logger.error(`Failed to restart deployment ${name}: ${error.message}`, {
      deploymentName: name,
      namespace: namespace,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

export default {
  getAllDeployments,
  getDeploymentByName,
  getDeploymentPods,
  streamDeploymentLogs,
  restartDeployment,
  createDeployment,
};
