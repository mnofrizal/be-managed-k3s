import { getKubernetesClient } from "./src/config/kubernetes.js";

async function testGetNodes() {
  console.log("Testing getNodes function...");

  try {
    const k8sClient = getKubernetesClient();
    console.log("✅ Kubernetes client initialized");

    const response = await k8sClient.getNodes();
    console.log("✅ getNodes() executed successfully");

    // Handle different response structures
    const nodes = response.body || response;

    if (!nodes || !nodes.items) {
      console.log("Response structure:", JSON.stringify(response, null, 2));
      throw new Error("Invalid response structure - no items found");
    }

    console.log("\n=== Node Information ===");
    console.log(`Total nodes: ${nodes.items.length}`);

    if (nodes.items.length === 0) {
      console.log("No nodes found in the cluster");
      return;
    }

    nodes.items.forEach((node, index) => {
      console.log(`\n--- Node ${index + 1} ---`);
      console.log(`Name: ${node.metadata?.name || "Unknown"}`);

      const readyCondition = node.status?.conditions?.find(
        (c) => c.type === "Ready"
      );
      console.log(`Status: ${readyCondition?.status || "Unknown"}`);

      if (node.status?.nodeInfo) {
        console.log(`OS: ${node.status.nodeInfo.osImage || "Unknown"}`);
        console.log(
          `Kubelet Version: ${node.status.nodeInfo.kubeletVersion || "Unknown"}`
        );
        console.log(
          `Architecture: ${node.status.nodeInfo.architecture || "Unknown"}`
        );
      }

      // Display addresses
      if (node.status?.addresses) {
        console.log("Addresses:");
        node.status.addresses.forEach((addr) => {
          console.log(`  ${addr.type}: ${addr.address}`);
        });
      }

      // Display capacity
      if (node.status?.capacity) {
        console.log("Capacity:");
        console.log(`  CPU: ${node.status.capacity.cpu || "Unknown"}`);
        console.log(`  Memory: ${node.status.capacity.memory || "Unknown"}`);
        console.log(`  Pods: ${node.status.capacity.pods || "Unknown"}`);
      }
    });

    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("❌ Error testing getNodes:", error.message);

    if (error.response) {
      console.error(
        "Response error:",
        error.response.status,
        error.response.statusText
      );
    }

    if (error.body) {
      console.error("Error body:", JSON.stringify(error.body, null, 2));
    }

    console.error("Full error:", error);
  }
}

// Run the test
testGetNodes();
