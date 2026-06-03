// Stubs for X/Y/ZMODEM. To be implemented.
export type XferProtocol = "xmodem" | "ymodem" | "zmodem";

export interface XferProgress {
  bytesTransferred: number;
  bytesTotal: number;
  filename?: string;
}
