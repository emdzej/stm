// Minimal TypeScript declarations for zmodem.js — the package ships pure JS
// with no types. We expose only the surface we actually use; the rest is
// reachable via `any` casts at call sites.

declare module "zmodem.js/src/zmodem_browser.js" {
  export interface ZmodemOfferDetails {
    name: string;
    size: number;
    mtime?: number;
    mode?: number;
  }

  export interface ZmodemOffer {
    get_details(): ZmodemOfferDetails;
    accept(): Promise<Uint8Array[]>;
    skip(): void;
    on(event: "input", handler: (payload: Uint8Array) => void): void;
  }

  export interface ZmodemSession {
    type: "receive" | "send";
    on(event: string, handler: (...args: unknown[]) => void): void;
    start(): Promise<void>;
    abort(): void;
    close(): void;
  }

  export interface ZmodemDetection {
    confirm(): ZmodemSession;
    deny(): void;
  }

  export class Sentry {
    constructor(opts: {
      to_terminal: (bytes: Uint8Array | number[]) => void;
      sender: (bytes: Uint8Array | number[]) => void;
      on_retract: () => void;
      on_detect: (detection: ZmodemDetection) => void;
    });
    consume(bytes: Uint8Array | number[]): void;
  }

  export interface ZmodemBrowser {
    send_files(
      session: ZmodemSession,
      files: File[] | FileList,
      opts?: { on_offer_response?: (file: File, xfer: unknown) => void },
    ): Promise<unknown>;
  }

  const Zmodem: {
    Sentry: typeof Sentry;
    Browser: ZmodemBrowser;
  };
  export default Zmodem;
}
