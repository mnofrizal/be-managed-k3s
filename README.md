# K3s Management API

A simple Express.js API for managing K3s clusters using the Kubernetes API.

## Features

- Get all nodes in the cluster
- Get specific node details by name
- Health check endpoint
- Error handling and response formatting

## Prerequisites

- Node.js (v14 or higher)
- K3s or K3d cluster running
- kubectl configured with access to your cluster

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Start the server

```bash
npm start
```

The server will start on port 3000 by default.

### Available Endpoints

#### Health Check

- **GET** `/health`
  - Returns server status
  - Response:
    ```json
    {
      "status": "OK",
      "message": "K3s Management API is running"
    }
    ```

#### Get All Nodes

- **GET** `/api/nodes`
  - Returns all nodes in the cluster
  - Response:
    ```json
    {
      "success": true,
      "data": [
        {
          "name": "k3d-mycluster-server-0",
          "status": "True",
          "labels": {
            "beta.kubernetes.io/arch": "amd64",
            "kubernetes.io/hostname": "k3d-mycluster-server-0"
          },
          "annotations": {},
          "creationTimestamp": "2024-08-02T15:00:00Z",
          "capacity": {
            "cpu": "4",
            "memory": "8042888Ki",
            "pods": "110"
          },
          "addresses": [
            {
              "type": "InternalIP",
              "address": "172.18.0.2"
            }
          ],
          "nodeInfo": {
            "architecture": "amd64",
            "osImage": "K3s v1.28.3+k3s1",
            "kubeletVersion": "v1.28.3+k3s1",
            "containerRuntimeVersion": "containerd://1.7.6-k3s1"
          }
        }
      ],
      "count": 1
    }
    ```

#### Get Specific Node

- **GET** `/api/nodes/:name`
  - Returns details for a specific node
  - Example: `/api/nodes/k3d-mycluster-server-0`
  - Response:
    ```json
    {
      "success": true,
      "data": {
        "name": "k3d-mycluster-server-0",
        "status": "True",
        "labels": {},
        "annotations": {},
        "creationTimestamp": "2024-08-02T15:00:00Z",
        "capacity": {},
        "allocatable": {},
        "addresses": [],
        "nodeInfo": {},
        "conditions": []
      }
    }
    ```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Testing the API

You can test the API using curl or any HTTP client:

```bash
# Health check
curl http://localhost:3000/health

# Get all nodes
curl http://localhost:3000/api/nodes

# Get specific node
curl http://localhost:3000/api/nodes/k3d-mycluster-server-0
```

## Environment Variables

- `PORT`: Server port (default: 3000)

## Development

The project uses:

- Express.js for the web server
- @kubernetes/client-node for Kubernetes API interaction
- Automatic kubeconfig loading from default locations

## Troubleshooting

### Common Issues

1. **"Failed to fetch nodes" error**

   - Ensure kubectl is properly configured
   - Check if your K3s/K3d cluster is running
   - Verify you have permission to list nodes

2. **Permission denied errors**

   - Make sure your kubeconfig has the necessary permissions
   - Check RBAC settings in your cluster

3. **Connection refused**
   - Ensure the server is running on the correct port
   - Check firewall settings

## License

ISC
