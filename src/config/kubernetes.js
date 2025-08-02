import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);

export { k8sApi, kubeConfig };
export default { k8sApi, kubeConfig };
