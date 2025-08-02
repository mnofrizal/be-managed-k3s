import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);

export { k8sApi, kubeConfig };
export default { k8sApi, kubeConfig };

export const getKubernetesClient = () => {
  return {
    getClusterInfo: async () => {
      const version = await k8sApi.getAPIVersions();
      return {
        version: version.body,
        server: kc.getCurrentCluster()?.server,
      };
    },

    getNodes: async () => {
      return await k8sApi.listNode();
    },

    getNamespaces: async () => {
      return await k8sApi.listNamespace();
    },

    getPods: async (namespace = "default") => {
      return await k8sApi.listNamespacedPod(namespace);
    },

    getPod: async (namespace, podName) => {
      try {
        const response = await k8sApi.readNamespacedPod(podName, namespace);
        return response.body;
      } catch (error) {
        if (error.statusCode === 404) {
          return null;
        }
        throw error;
      }
    },

    createPod: async (namespace, podSpec) => {
      return await k8sApi.createNamespacedPod(namespace, podSpec);
    },

    deletePod: async (namespace, podName) => {
      return await k8sApi.deleteNamespacedPod(podName, namespace);
    },

    getPodLogs: async (namespace, podName, container, tailLines = 100) => {
      const response = await k8sApi.readNamespacedPodLog(
        podName,
        namespace,
        container,
        undefined,
        undefined,
        undefined,
        undefined,
        tailLines
      );
      return response.body;
    },

    getPodEvents: async (namespace, podName) => {
      const response = await k8sApi.listNamespacedEvent(
        namespace,
        undefined,
        undefined,
        undefined,
        `involvedObject.name=${podName}`
      );
      return response.body.items;
    },

    getNode: async (nodeName) => {
      try {
        const response = await k8sApi.readNode(nodeName);
        return response.body;
      } catch (error) {
        if (error.statusCode === 404) {
          return null;
        }
        throw error;
      }
    },
  };
};
