# How to Use the Kubernetes API to Get Pod Information

This documentation explains how to interact with the Kubernetes API to fetch pod data, based on the implementation in `src/services/pod.service.js`.

## 1. Setup and Configuration

First, you need to set up the Kubernetes client. This is done using the `@kubernetes/client-node` library.

```javascript
import { KubeConfig, CoreV1Api, Metrics } from "@kubernetes/client-node";

// Load Kubernetes configuration from default location (e.g., ~/.kube/config)
const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

// Create an API client for the CoreV1Api
const k8sApi = kubeConfig.makeApiClient(CoreV1Api);

// Create a metrics client
const metricsClient = new Metrics(kubeConfig);
```

## 2. Fetching All Pods

You can fetch a list of all pods, either from all namespaces or from a specific namespace.

### a. Get Pods from All Namespaces

To get pods from all available namespaces, use the `listPodForAllNamespaces` method.

**API Call:**

```javascript
const response = await k8sApi.listPodForAllNamespaces();
const pods = response.body.items;
```

**Example from `pod.service.js`:**
The `getAllPods` function in the service handles this. If no namespace is provided, it calls `listPodForAllNamespaces`.

```javascript
// In getAllPods function
if (namespace) {
  // ...
} else {
  res = await k8sApi.listPodForAllNamespaces();
}
```

### b. Get Pods from a Specific Namespace

To get pods from a single namespace, use the `listNamespacedPod` method and provide the namespace.

**API Call:**

```javascript
const namespace = "default";
const response = await k8sApi.listNamespacedPod({
  namespace: namespace,
});
const pods = response.body.items;
```

**Example from `pod.service.js`:**
The `getAllPods` function also handles this when a namespace is passed as an argument.

```javascript
// In getAllPods function
if (namespace) {
  res = await k8sApi.listNamespacedPod({
    namespace: namespace,
  });
}
```

## 3. Fetching a Specific Pod by Name

To get a single pod, you need its name and namespace. Use the `readNamespacedPod` method for this.

**API Call:**

```javascript
const podName = "my-pod-123";
const namespace = "default";
const response = await k8sApi.readNamespacedPod({
  name: podName,
  namespace: namespace,
});
const pod = response.body;
```

**Example from `pod.service.js`:**
The `getPodByName` function implements this.

```javascript
// In getPodByName function
const res = await k8sApi.readNamespacedPod({
  name: podName,
  namespace: namespaceName,
});
```

## 4. Fetching Pod Metrics

Pod metrics (CPU and memory usage) are fetched using the `Metrics` client. The service fetches metrics for all pods and then maps them to the corresponding pod data.

**API Call:**

```javascript
const podMetrics = await metricsClient.getPodMetrics();
```

**Example from `pod.service.js`:**
The `getPodMetrics` helper function fetches the metrics and processes them into a more usable format. This is then integrated into the main pod data.

```javascript
// In getPodMetrics function
const podMetrics = await metricsClient.getPodMetrics();

// ... processing logic ...

// In getAllPods and getPodByName functions
const podMetricsMap = await getPodMetrics();
const metricsKey = `${podNamespace}/${podName}`;
const podMetricsData = podMetricsMap[metricsKey] || null;
```

## 5. Data Structure

The service processes the raw API response and returns a structured object for each pod, including status, specs, container details, resources, and metrics. This provides a consistent and easy-to-use data format.

## 6. Error Handling

The service includes error handling for common issues:

- **Connection Errors**: If the API server is unreachable (`ECONNREFUSED` or `ENOTFOUND`), it throws a specific error message.
- **Not Found (404)**: If a requested pod or namespace does not exist, it throws a "Not Found" error.
- **Invalid Response**: If the API returns an unexpected structure, it logs an error and throws an exception.

This ensures that the application can gracefully handle API issues and provide meaningful feedback.
