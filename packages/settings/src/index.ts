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

export interface Macro {
  id: string;
  name: string;
  /** Payload as a text string. Supports backslash escapes interpreted at
   * send time: `\r` `\n` `\t` `\0` `\\` `\xNN`. */
  payload: string;
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
  /** Geometry mode. "fit" sizes the terminal to its container (default);
   * "fixed" forces cols × rows and lets the container scroll if needed. */
  geometry: "fit" | "fixed";
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
  macros: Macro[];
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
  macros: [],
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
    geometry: "fit",
    backspaceMode: "del",
    localEcho: false,
    eightBitClean: true,
  },
  logging: { enabled: false },
  theme: "system",
};

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Shallow-merge `src` over `defaults`, keeping only keys that exist in
 * `defaults` and whose value has the same primitive type. Imported JSON is
 * untrusted — this keeps a hand-edited or malicious file from injecting
 * wrong-typed values that later blow up (or worse) deep inside the UI. */
function pickTyped<T extends object>(defaults: T, src: unknown): T {
  const out = { ...defaults } as Json;
  if (!isObj(src)) return out as T;
  for (const [k, def] of Object.entries(defaults)) {
    const v = src[k];
    if (v !== undefined && typeof v === typeof def && !isObj(def)) out[k] = v;
  }
  return out as T;
}

/** Keep array entries that are objects carrying the given string fields. */
function pickList<T>(src: unknown, required: string[], fallback: T[], map: (o: Json) => T): T[] {
  if (!Array.isArray(src)) return fallback;
  return src
    .filter((o): o is Json => isObj(o) && required.every((k) => typeof o[k] === "string"))
    .map(map);
}

const DEFAULT_CONFIG = DEFAULTS.connect.config;

/** Merge persisted settings on top of DEFAULTS, recursing into known nested
 * groups so additive schema changes don't lose user values. */
function merge(parsed: Json): Settings {
  const connect = isObj(parsed.connect) ? parsed.connect : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: pickTyped({ theme: DEFAULTS.theme }, parsed).theme,
    connect: {
      ...pickTyped(DEFAULTS.connect, connect),
      config: pickTyped(DEFAULT_CONFIG, connect.config),
    },
    monitor: pickTyped(DEFAULTS.monitor, parsed.monitor),
    terminal: pickTyped(DEFAULTS.terminal, parsed.terminal),
    logging: pickTyped(DEFAULTS.logging, parsed.logging),
    serialPresets: pickList(parsed.serialPresets, ["id", "name"], DEFAULTS.serialPresets, (o) => ({
      ...pickTyped(DEFAULT_CONFIG, o),
      id: o.id as string,
      name: o.name as string,
    })),
    tunnelProfiles: pickList(parsed.tunnelProfiles, ["id", "name", "url"], DEFAULTS.tunnelProfiles, (o) => ({
      id: o.id as string,
      name: o.name as string,
      url: o.url as string,
      ...(typeof o.token === "string" ? { token: o.token } : {}),
    })),
    macros: pickList(parsed.macros, ["id", "name", "payload"], DEFAULTS.macros, (o) => ({
      id: o.id as string,
      name: o.name as string,
      payload: o.payload as string,
    })),
  };
}

export function load(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS;
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed) || parsed.schemaVersion !== SCHEMA_VERSION) return DEFAULTS;
    return merge(parsed);
  } catch {
    return DEFAULTS;
  }
}

export function save(settings: Settings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export interface ExportOptions {
  /** Include tunnel tokens. Off by default so a shared settings file doesn't
   * leak credentials. */
  includeSecrets?: boolean;
}

export function exportJson(settings: Settings, opts: ExportOptions = {}): string {
  if (opts.includeSecrets) return JSON.stringify(settings, null, 2);
  const redacted: Settings = {
    ...settings,
    connect: { ...settings.connect, tunnelToken: "" },
    tunnelProfiles: settings.tunnelProfiles.map(({ token: _token, ...rest }) => rest),
  };
  return JSON.stringify(redacted, null, 2);
}

export function importJson(json: string): Settings {
  const parsed: unknown = JSON.parse(json);
  if (!isObj(parsed)) throw new Error("Settings file must contain a JSON object");
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Incompatible settings version: ${String(parsed.schemaVersion)}`);
  }
  return merge(parsed);
}
