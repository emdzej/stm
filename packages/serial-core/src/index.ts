export type {
  SerialConfig,
  SerialSignals,
  SerialTransport,
  TransportEvent,
  TransportState,
} from "./types.js";
export { WebSerialTransport, isWebSerialAvailable } from "./web-serial.js";
export { WebSocketTransport } from "./websocket.js";
