/**
 * localStorage-backed settings store. JSON import/export.
 * Versioned schema; bump SCHEMA_VERSION on incompatible changes (additive
 * changes are handled by the nested merge in load()).
 */
export const SCHEMA_VERSION = 1;
const KEY = "stm.settings.v1";

export interface SerialPreset {
  id: string;
  name: string;
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware";
}

export interface TunnelProfile {
  id: string;
  name: string;
  url: string;
  token?: string;
}

export interface MonitorPrefs {
  view: "ascii" | "hex";
  composerMode: "ascii" | "hex";
  lineEnding: "none" | "cr" | "lf" | "crlf" | "nul";
  echoLocal: boolean;
}

/** Structurally compatible with @emdzej/stm-serial-core's SerialConfig.
 * Duplicated here so the settings package has no runtime dependency on
 * serial-core. */
export interface SerialPortConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware";
}

export interface ConnectPrefs {
  transport: "web-serial" | "tunnel";
  tunnelUrl: string;
  tunnelToken: string;
  config: SerialPortConfig;
}

export interface TerminalPrefs {
  cols: number;
  rows: number;
  fontSize: number;
  cursorStyle: "block" | "underline" | "bar";
  /** What the Backspace key emits. `"del"` = 0x7F (modern shells, GNU
   * readline default). `"ctrl-h"` = 0x08 (many bootloaders, older systems). */
  backspaceMode: "del" | "ctrl-h";
  /** When true, locally write outgoing keystrokes to the terminal as well
   * as sending them. Use for devices that don't echo. */
  localEcho: boolean;
  /** When false, strip the high bit on incoming bytes (legacy 7-bit clean). */
  eightBitClean: boolean;
}

export type ThemeChoice = "system" | "light" | "dark";

export interface LoggingPrefs {
  /** When true, the app records every connected session's incoming bytes
   * into OPFS with metadata in IndexedDB. */
  enabled: boolean;
}

export interface Settings {
  schemaVersion: number;
  serialPresets: SerialPreset[];
  tunnelProfiles: TunnelProfile[];
  connect: ConnectPrefs;
  monitor: MonitorPrefs;
  terminal: TerminalPrefs;
  logging: LoggingPrefs;
  theme: ThemeChoice;
}

export const DEFAULTS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  serialPresets: [
    {
      id: "default",
      name: "115200 8N1",
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    },
  ],
  tunnelProfiles: [],
  connect: {
    transport: "web-serial",
    tunnelUrl: "ws://127.0.0.1:8787",
    tunnelToken: "",
    config: {
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    },
  },
  monitor: { view: "ascii", composerMode: "ascii", lineEnding: "lf", echoLocal: false },
  terminal: {
    cols: 80,
    rows: 25,
    fontSize: 13,
    cursorStyle: "block",
    backspaceMode: "del",
    localEcho: false,
    eightBitClean: true,
  },
  logging: { enabled: false },
  theme: "system",
};

/** Merge persisted settings on top of DEFAULTS, recursing into known nested
 * groups so additive schema changes don't lose user values. */
function merge(parsed: Partial<Settings>): Settings {
  return {
    ...DEFAULTS,
    ...parsed,
    connect: {
      ...DEFAULTS.connect,
      ...(parsed.connect ?? {}),
      config: { ...DEFAULTS.connect.config, ...(parsed.connect?.config ?? {}) },
    },
    monitor: { ...DEFAULTS.monitor, ...(parsed.monitor ?? {}) },
    terminal: { ...DEFAULTS.terminal, ...(parsed.terminal ?? {}) },
    logging: { ...DEFAULTS.logging, ...(parsed.logging ?? {}) },
    serialPresets: parsed.serialPresets ?? DEFAULTS.serialPresets,
    tunnelProfiles: parsed.tunnelProfiles ?? DEFAULTS.tunnelProfiles,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function load(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS;
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return DEFAULTS;
    return merge(parsed);
  } catch {
    return DEFAULTS;
  }
}

export function save(settings: Settings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function exportJson(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}

export function importJson(json: string): Settings {
  const parsed = JSON.parse(json) as Partial<Settings>;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Incompatible settings version: ${parsed.schemaVersion}`);
  }
  return merge(parsed);
}
