export const transformPodData = (pod, podMetricsMap = {}) => {
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
};
