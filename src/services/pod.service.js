import { KubeConfig, CoreV1Api, Metrics } from "@kubernetes/client-node";
import logger from "../config/logger.js";

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

const k8sApi = kubeConfig.makeApiClient(CoreV1Api);
const metricsClient = new Metrics(kubeConfig);

// Helper function to get pod metrics
const getPodMetrics = async () => {
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

export const getAllPods = async (namespace = null) => {
  try {
    logger.debug("Calling Kubernetes API to list all pods", {
      namespace: namespace || "all namespaces",
    });

    let res;
    if (namespace) {
      // Get pods from specific namespace
      res = await k8sApi.listNamespacedPod({
        namespace: namespace,
      });
    } else {
      // Get pods from all namespaces
      res = await k8sApi.listPodForAllNamespaces();
    }

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
      throw new Error("No pods found in cluster or invalid response format");
    }

    // Get pod metrics (make it optional to avoid breaking the main functionality)
    logger.debug("Fetching pod metrics to include with pod data");
    let podMetricsMap = {};
    try {
      podMetricsMap = await getPodMetrics();
    } catch (metricsError) {
      logger.warn("Failed to fetch pod metrics, continuing without metrics", {
        error: metricsError.message,
      });
    }

    const pods = responseData.items.map((pod) => {
      // Get pod status
      const podPhase = pod.status?.phase || "Unknown";
      const conditions = pod.status?.conditions || [];
      const readyCondition = conditions.find((c) => c.type === "Ready");
      const isReady = readyCondition?.status === "True";

      // Get container statuses and specs
      const containerStatuses = pod.status?.containerStatuses || [];
      const containerSpecs = pod.spec?.containers || [];

      // Create a map of container specs by name for easy lookup
      const containerSpecMap = {};
      containerSpecs.forEach((spec) => {
        containerSpecMap[spec.name] = spec;
      });

      const containers = containerStatuses.map((container) => {
        const spec = containerSpecMap[container.name] || {};

        return {
          name: container.name,
          ready: container.ready,
          restartCount: container.restartCount,
          image: container.image,
          imageID: container.imageID,
          containerID: container.containerID,
          state: container.state,
          lastState: container.lastState,
          environment:
            spec.env?.map((env) => ({
              name: env.name,
              value: env.value,
              valueFrom: env.valueFrom,
            })) || [],
          ports:
            spec.ports?.map((port) => ({
              name: port.name,
              containerPort: port.containerPort,
              protocol: port.protocol,
              hostPort: port.hostPort,
              hostIP: port.hostIP,
            })) || [],
          volumeMounts:
            spec.volumeMounts?.map((mount) => ({
              name: mount.name,
              mountPath: mount.mountPath,
              readOnly: mount.readOnly,
              subPath: mount.subPath,
            })) || [],
          resources: {
            requests: spec.resources?.requests || {},
            limits: spec.resources?.limits || {},
          },
          livenessProbe: spec.livenessProbe,
          readinessProbe: spec.readinessProbe,
          startupProbe: spec.startupProbe,
          workingDir: spec.workingDir,
          command: spec.command,
          args: spec.args,
        };
      });

      // Calculate resource requests and limits
      const resourceRequests = {
        cpu: "0",
        memory: "0",
      };
      const resourceLimits = {
        cpu: "0",
        memory: "0",
      };

      if (pod.spec?.containers) {
        pod.spec.containers.forEach((container) => {
          if (container.resources?.requests) {
            if (container.resources.requests.cpu) {
              resourceRequests.cpu = container.resources.requests.cpu;
            }
            if (container.resources.requests.memory) {
              resourceRequests.memory = container.resources.requests.memory;
            }
          }
          if (container.resources?.limits) {
            if (container.resources.limits.cpu) {
              resourceLimits.cpu = container.resources.limits.cpu;
            }
            if (container.resources.limits.memory) {
              resourceLimits.memory = container.resources.limits.memory;
            }
          }
        });
      }

      // Get pod metrics
      const podName = pod.metadata?.name;
      const podNamespace = pod.metadata?.namespace;
      const metricsKey = `${podNamespace}/${podName}`;
      const podMetrics = podMetricsMap[metricsKey] || null;

      return {
        name: podName,
        namespace: podNamespace,
        status: {
          phase: podPhase,
          ready: isReady,
          conditions: conditions,
        },
        spec: {
          nodeName: pod.spec?.nodeName,
          restartPolicy: pod.spec?.restartPolicy,
          serviceAccount: pod.spec?.serviceAccountName,
        },
        network: {
          podIP: pod.status?.podIP,
          hostIP: pod.status?.hostIP,
          ports:
            pod.spec?.containers?.flatMap(
              (container) =>
                container.ports?.map((port) => ({
                  name: port.name,
                  containerPort: port.containerPort,
                  protocol: port.protocol,
                  hostPort: port.hostPort,
                })) || []
            ) || [],
        },
        containers: containers,
        resources: {
          requests: resourceRequests,
          limits: resourceLimits,
        },
        metrics: podMetrics,
        creationTimestamp: pod.metadata?.creationTimestamp,
        labels: pod.metadata?.labels,
        annotations: pod.metadata?.annotations,
        ownerReferences: pod.metadata?.ownerReferences,
      };
    });

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

    // Check if it's a Kubernetes connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    // Check if namespace doesn't exist
    if (error.statusCode === 404 && namespace) {
      throw new Error(`Namespace '${namespace}' not found`);
    }

    throw new Error(`Failed to fetch pods: ${error.message}`);
  }
};

export const getPodByName = async (name, namespace = "default") => {
  try {
    // Validate input parameters
    if (!name || typeof name !== "string" || name.trim() === "") {
      logger.error("Invalid pod name parameter", {
        name: name,
        type: typeof name,
      });
      throw new Error("Pod name is required and must be a non-empty string");
    }

    if (
      !namespace ||
      typeof namespace !== "string" ||
      namespace.trim() === ""
    ) {
      logger.error("Invalid namespace parameter", {
        namespace: namespace,
        type: typeof namespace,
      });
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

    // The response structure is correct - it's a direct object, not nested in body
    const responseData = res.body || res;

    if (!responseData) {
      logger.error(`Invalid response from Kubernetes API for pod: ${podName}`, {
        response: res,
      });
      throw new Error("Invalid response from Kubernetes API");
    }

    const pod = responseData;

    // Get pod metrics (make it optional to avoid breaking the main functionality)
    logger.debug(
      `Fetching metrics for pod: ${podName} in namespace: ${namespaceName}`
    );
    let podMetricsMap = {};
    let podMetrics = null;
    try {
      podMetricsMap = await getPodMetrics();
      const metricsKey = `${namespaceName}/${podName}`;
      podMetrics = podMetricsMap[metricsKey] || null;
    } catch (metricsError) {
      logger.warn("Failed to fetch pod metrics, continuing without metrics", {
        error: metricsError.message,
      });
    }

    // Get pod status
    const podPhase = pod.status?.phase || "Unknown";
    const conditions = pod.status?.conditions || [];
    const readyCondition = conditions.find((c) => c.type === "Ready");
    const isReady = readyCondition?.status === "True";

    // Get container statuses and specs
    const containerStatuses = pod.status?.containerStatuses || [];
    const containerSpecs = pod.spec?.containers || [];

    // Create a map of container specs by name for easy lookup
    const containerSpecMap = {};
    containerSpecs.forEach((spec) => {
      containerSpecMap[spec.name] = spec;
    });

    const containers = containerStatuses.map((container) => {
      const spec = containerSpecMap[container.name] || {};

      return {
        name: container.name,
        ready: container.ready,
        restartCount: container.restartCount,
        image: container.image,
        imageID: container.imageID,
        containerID: container.containerID,
        state: container.state,
        lastState: container.lastState,
        environment:
          spec.env?.map((env) => ({
            name: env.name,
            value: env.value,
            valueFrom: env.valueFrom,
          })) || [],
        ports:
          spec.ports?.map((port) => ({
            name: port.name,
            containerPort: port.containerPort,
            protocol: port.protocol,
            hostPort: port.hostPort,
            hostIP: port.hostIP,
          })) || [],
        volumeMounts:
          spec.volumeMounts?.map((mount) => ({
            name: mount.name,
            mountPath: mount.mountPath,
            readOnly: mount.readOnly,
            subPath: mount.subPath,
          })) || [],
        resources: {
          requests: spec.resources?.requests || {},
          limits: spec.resources?.limits || {},
        },
        livenessProbe: spec.livenessProbe,
        readinessProbe: spec.readinessProbe,
        startupProbe: spec.startupProbe,
        workingDir: spec.workingDir,
        command: spec.command,
        args: spec.args,
      };
    });

    // Calculate resource requests and limits
    const resourceRequests = {
      cpu: "0",
      memory: "0",
    };
    const resourceLimits = {
      cpu: "0",
      memory: "0",
    };

    if (pod.spec?.containers) {
      pod.spec.containers.forEach((container) => {
        if (container.resources?.requests) {
          if (container.resources.requests.cpu) {
            resourceRequests.cpu = container.resources.requests.cpu;
          }
          if (container.resources.requests.memory) {
            resourceRequests.memory = container.resources.requests.memory;
          }
        }
        if (container.resources?.limits) {
          if (container.resources.limits.cpu) {
            resourceLimits.cpu = container.resources.limits.cpu;
          }
          if (container.resources.limits.memory) {
            resourceLimits.memory = container.resources.limits.memory;
          }
        }
      });
    }

    const podData = {
      name: pod.metadata?.name,
      namespace: pod.metadata?.namespace,
      status: {
        phase: podPhase,
        ready: isReady,
        conditions: conditions,
      },
      spec: {
        nodeName: pod.spec?.nodeName,
        restartPolicy: pod.spec?.restartPolicy,
        serviceAccount: pod.spec?.serviceAccountName,
      },
      network: {
        podIP: pod.status?.podIP,
        hostIP: pod.status?.hostIP,
        ports:
          pod.spec?.containers?.flatMap(
            (container) =>
              container.ports?.map((port) => ({
                name: port.name,
                containerPort: port.containerPort,
                protocol: port.protocol,
                hostPort: port.hostPort,
              })) || []
          ) || [],
      },
      containers: containers,
      resources: {
        requests: resourceRequests,
        limits: resourceLimits,
      },
      metrics: podMetrics,
      creationTimestamp: pod.metadata?.creationTimestamp,
      labels: pod.metadata?.labels,
      annotations: pod.metadata?.annotations,
      ownerReferences: pod.metadata?.ownerReferences,
    };

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

    // Check if it's a 404 error (pod not found)
    if (error.statusCode === 404) {
      throw new Error(`Pod '${name}' not found in namespace '${namespace}'`);
    }

    // Check if it's a connection error
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      throw new Error(
        "Cannot connect to Kubernetes cluster. Please check your kubeconfig and cluster status."
      );
    }

    throw new Error(`Failed to fetch pod ${name}: ${error.message}`);
  }
};

export const getPodsByNamespace = async (namespace) => {
  try {
    // Validate input parameter
    if (
      !namespace ||
      typeof namespace !== "string" ||
      namespace.trim() === ""
    ) {
      logger.error("Invalid namespace parameter", {
        namespace: namespace,
        type: typeof namespace,
      });
      throw new Error("Namespace is required and must be a non-empty string");
    }

    return await getAllPods(namespace.trim());
  } catch (error) {
    throw error; // Re-throw the error from getAllPods
  }
};

export default {
  getAllPods,
  getPodByName,
  getPodsByNamespace,
};
