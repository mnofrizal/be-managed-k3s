import clusterService from "../services/cluster.service.js";
import logger from "../config/logger.js";

export const getAllClusters = async (req, res) => {
  try {
    logger.info("Fetching all clusters");
    const clusters = await clusterService.getAllClusters();

    logger.info(`Successfully retrieved ${clusters.length} cluster(s)`);
    res.json({ success: true, data: clusters });
  } catch (error) {
    logger.error("Failed to fetch all clusters", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({ success: false, error: error.message });
  }
};

export const getClusterByName = async (req, res) => {
  try {
    const { name } = req.params;

    // Validate that name parameter exists
    if (!name || name.trim() === "") {
      logger.warn("Cluster name parameter is missing or empty", {
        params: req.params,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Cluster name parameter is required",
      });
    }

    logger.info(`Fetching cluster by name: ${name}`);

    const cluster = await clusterService.getClusterByName(name.trim());

    logger.info(`Successfully retrieved cluster: ${name}`);
    res.json({ success: true, data: cluster });
  } catch (error) {
    logger.error(`Failed to fetch cluster: ${req.params.name}`, {
      clusterName: req.params.name,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  getAllClusters,
  getClusterByName,
};
