import { Exec, Log } from "@kubernetes/client-node";
import stream from "stream";
import logger from "../../config/logger.js";

export const connectToPodTerminal = async (
  clientWs,
  kubeConfig,
  k8sApi,
  namespace,
  podName,
  containerName,
  shell
) => {
  const exec = new Exec(kubeConfig);
  const command = shell ? [shell] : ["/bin/sh"];
  let targetContainer = containerName;

  try {
    // If no container name is provided, get it from the pod spec
    if (!targetContainer) {
      logger.info(
        `Container name not provided for pod: ${podName}. Fetching from spec.`
      );
      const pod = await k8sApi.readNamespacedPod({
        name: podName,
        namespace: namespace,
      });
      if (pod.body.spec.containers && pod.body.spec.containers.length > 0) {
        targetContainer = pod.body.spec.containers[0].name;
        logger.info(`Using first container found: ${targetContainer}`);
      } else {
        throw new Error(`No containers found in pod: ${podName}`);
      }
    }

    logger.info(
      `Attempting to exec into pod: ${podName}, container: ${targetContainer}`
    );

    // Create streams for proper I/O handling
    const stdout = new stream.PassThrough();
    const stderr = new stream.PassThrough();
    const stdin = new stream.PassThrough();

    // Set up the exec connection
    await exec.exec(
      namespace,
      podName,
      targetContainer,
      command,
      stdout,
      stderr,
      stdin,
      true, // tty
      (status) => {
        logger.info("Exec process finished with status:", status);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.close(1000, "Process finished");
        }
      }
    );

    logger.info(`Successfully connected to pod ${podName}'s terminal.`);

    // Handle stdout - send to client
    stdout.on("data", (data) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(data.toString());
      }
    });

    // Handle stderr - send to client (usually combined with stdout in TTY mode)
    stderr.on("data", (data) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(data.toString());
      }
    });

    // Handle client input - send to stdin
    clientWs.on("message", (data) => {
      try {
        if (stdin.writable) {
          stdin.write(data);
        }
      } catch (err) {
        logger.error("Error writing to stdin:", err);
      }
    });

    // Handle client disconnect
    clientWs.on("close", (code, reason) => {
      logger.info(`Client WebSocket closed: ${code} ${reason}`);
      try {
        if (stdin.writable) {
          stdin.end();
        }
        if (stdout.readable) {
          stdout.destroy();
        }
        if (stderr.readable) {
          stderr.destroy();
        }
      } catch (err) {
        logger.error("Error closing streams:", err);
      }
    });

    // Handle client errors
    clientWs.on("error", (err) => {
      logger.error("Error on Client WebSocket:", err);
      try {
        if (stdin.writable) {
          stdin.end();
        }
      } catch (closeErr) {
        logger.error("Error closing stdin on client error:", closeErr);
      }
    });

    // Handle stream errors
    stdout.on("error", (err) => {
      logger.error("Error on stdout stream:", err);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.close(1011, "stdout stream error");
      }
    });

    stderr.on("error", (err) => {
      logger.error("Error on stderr stream:", err);
    });

    stdin.on("error", (err) => {
      logger.error("Error on stdin stream:", err);
    });

    // Handle stream close events
    stdout.on("close", () => {
      logger.info("stdout stream closed");
    });

    stderr.on("close", () => {
      logger.info("stderr stream closed");
    });

    stdin.on("close", () => {
      logger.info("stdin stream closed");
    });
  } catch (err) {
    logger.error(`Error setting up exec: ${err.message}`, {
      stack: err.stack,
    });
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close(1011, `Error setting up exec: ${err.message}`);
    }
  }
};

export const getPodLogs = async (k8sApi, namespace, podName, containerName) => {
  try {
    let targetContainer = containerName;
    if (!targetContainer) {
      const pod = await k8sApi.readNamespacedPod({
        name: podName,
        namespace: namespace,
      });
      if (pod.body.spec.containers && pod.body.spec.containers.length > 0) {
        targetContainer = pod.body.spec.containers[0].name;
      } else {
        throw new Error(`No containers found in pod: ${podName}`);
      }
    }

    const res = await k8sApi.readNamespacedPodLog({
      name: podName,
      namespace: namespace,
      container: targetContainer,
    });
    return res;
  } catch (err) {
    logger.error(`Failed to get logs for pod ${podName}: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }
};

export const streamPodLogs = async (
  clientWs,
  kubeConfig,
  k8sApi,
  namespace,
  podName,
  containerName
) => {
  try {
    let targetContainer = containerName;
    if (!targetContainer) {
      const pod = await k8sApi.readNamespacedPod({
        name: podName,
        namespace: namespace,
      });
      if (pod.body.spec.containers && pod.body.spec.containers.length > 0) {
        targetContainer = pod.body.spec.containers[0].name;
      } else {
        throw new Error(`No containers found in pod: ${podName}`);
      }
    }

    const log = new Log(kubeConfig);

    const logStream = new stream.PassThrough();
    logStream.on("data", (chunk) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(chunk.toString());
      }
    });

    logStream.on("error", (err) => {
      logger.error("Error in log stream PassThrough:", err);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.close(1011, "Log stream error");
      }
    });

    const logPromise = log.log(
      namespace,
      podName,
      targetContainer,
      logStream,
      (err) => {
        if (err) {
          logger.error("Log stream connection closed with error:", err);
        } else {
          logger.info("Log stream connection closed.");
        }
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.close();
        }
      },
      {
        follow: true,
        tailLines: 1000,
        pretty: false,
        timestamps: false,
      }
    );

    logPromise.catch((err) => {
      logger.error(
        `API error starting log stream for pod ${podName}: ${err.message}`,
        {
          stack: err.stack,
          body: err.body,
        }
      );
      if (clientWs.readyState === clientWs.OPEN) {
        const errorMessage = err.body?.message || err.message;
        clientWs.send(`Error: ${errorMessage}`);
        clientWs.close(1011, `Error streaming logs: ${errorMessage}`);
      }
    });

    clientWs.on("close", () => {
      logger.info(`Client disconnected, ending log stream for pod ${podName}.`);
      logStream.end();
      logPromise
        .then((req) => {
          if (req && typeof req.abort === "function") {
            req.abort();
          }
        })
        .catch(() => {});
    });
  } catch (err) {
    logger.error(
      `Failed to set up log stream for pod ${podName}: ${err.message}`,
      {
        stack: err.stack,
      }
    );
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close(1011, `Error setting up log stream: ${err.message}`);
    }
  }
};
