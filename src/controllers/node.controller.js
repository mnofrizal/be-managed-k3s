import nodeService from "../services/node.service.js";
import logger from "../config/logger.js";

export const getAllNodes = async (req, res) => {
  try {
    logger.info("Fetching all nodes");
    const nodes = await nodeService.getAllNodes();

    logger.info(`Successfully retrieved ${nodes.length} nodes`);
    res.json({ success: true, data: nodes });
  } catch (error) {
    logger.error("Failed to fetch all nodes", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({ success: false, error: error.message });
  }
};

export const getNodeByName = async (req, res) => {
  try {
    const { name } = req.params;

    // Validate that name parameter exists
    if (!name || name.trim() === "") {
      logger.warn("Node name parameter is missing or empty", {
        params: req.params,
        url: req.url,
      });
      return res.status(400).json({
        success: false,
        error: "Node name parameter is required",
      });
    }

    logger.info(`Fetching node by name: ${name}`);

    const node = await nodeService.getNodeByName(name.trim());

    logger.info(`Successfully retrieved node: ${name}`);
    res.json({ success: true, data: node });
  } catch (error) {
    logger.error(`Failed to fetch node: ${req.params.name}`, {
      nodeName: req.params.name,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  getAllNodes,
  getNodeByName,
};
