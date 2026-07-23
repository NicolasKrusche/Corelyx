/**
 * Connector Mocks — Re-export barrel.
 *
 * The canonical mock response registry lives in ./mock-connectors.ts.
 * This module re-exports everything under the `connector-mocks` name
 * so consumers can import from either path without confusion.
 *
 * @module connector-mocks
 */

export {
  getMockResponse,
  getRegisteredProviders,
  getConnectorOperations,
  CONNECTOR_MOCK_REGISTRY,
  type MockResponsePayload,
  type ConnectorMockDefinition,
} from "./mock-connectors";
