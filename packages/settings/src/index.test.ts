import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULTS,
  SCHEMA_VERSION,
  load,
  save,
  exportJson,
  importJson,
  type Settings,
} from "./index.js";

const KEY = "stm.settings.v1";

class FakeStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new FakeStorage();
});

describe("settings", () => {
  it("returns defaults when storage is empty", () => {
    expect(load()).toEqual(DEFAULTS);
  });

  it("round-trips through save / load", () => {
    const next: Settings = { ...DEFAULTS, theme: "dark" };
    save(next);
    expect(load().theme).toBe("dark");
  });

  it("merges additive fields without dropping user values", () => {
    // Persist a payload missing the recently-added terminal.backspaceMode
    // and logging.enabled fields.
    const partial = {
      schemaVersion: SCHEMA_VERSION,
      theme: "dark",
      monitor: { view: "ascii", composerMode: "ascii", lineEnding: "lf", echoLocal: false },
      terminal: { cols: 100, rows: 30, fontSize: 16, cursorStyle: "bar" },
    };
    localStorage.setItem(KEY, JSON.stringify(partial));
    const loaded = load();
    // User value preserved
    expect(loaded.theme).toBe("dark");
    expect(loaded.terminal.cols).toBe(100);
    expect(loaded.terminal.cursorStyle).toBe("bar");
    // New fields filled from defaults
    expect(loaded.terminal.backspaceMode).toBe(DEFAULTS.terminal.backspaceMode);
    expect(loaded.terminal.eightBitClean).toBe(DEFAULTS.terminal.eightBitClean);
    expect(loaded.logging.enabled).toBe(DEFAULTS.logging.enabled);
  });

  it("resets to defaults when persisted schemaVersion doesn't match", () => {
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 999, theme: "dark" }));
    expect(load()).toEqual(DEFAULTS);
  });

  it("falls back to defaults on parse error", () => {
    localStorage.setItem(KEY, "not json");
    expect(load()).toEqual(DEFAULTS);
  });

  it("exportJson + importJson round-trips", () => {
    const custom: Settings = {
      ...DEFAULTS,
      theme: "light",
      tunnelProfiles: [{ id: "x", name: "Home", url: "ws://x:1", token: "t" }],
      macros: [{ id: "m1", name: "AT", payload: "AT\\r" }],
    };
    const json = exportJson(custom, { includeSecrets: true });
    const restored = importJson(json);
    expect(restored.theme).toBe("light");
    expect(restored.tunnelProfiles).toEqual(custom.tunnelProfiles);
    expect(restored.macros).toEqual(custom.macros);
  });

  it("importJson rejects incompatible schema version", () => {
    expect(() => importJson(JSON.stringify({ schemaVersion: 999 }))).toThrow(
      /Incompatible settings version/,
    );
  });

  it("exportJson redacts tunnel tokens by default", () => {
    const custom: Settings = {
      ...DEFAULTS,
      connect: { ...DEFAULTS.connect, tunnelToken: "live-secret" },
      tunnelProfiles: [{ id: "x", name: "Home", url: "ws://x:1", token: "profile-secret" }],
    };
    const json = exportJson(custom);
    expect(json).not.toContain("live-secret");
    expect(json).not.toContain("profile-secret");
    expect(importJson(json).tunnelProfiles).toEqual([{ id: "x", name: "Home", url: "ws://x:1" }]);
  });

  it("importJson drops wrong-typed values and malformed list entries", () => {
    const restored = importJson(
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        theme: 42,
        terminal: { cols: "80; rm -rf /", fontSize: 20, extra: "x" },
        connect: { tunnelUrl: { evil: true }, config: { baudRate: 9600, parity: 1 } },
        macros: [{ id: "a", name: "ok", payload: "x" }, { id: 1 }, null, "str"],
        tunnelProfiles: "not-a-list",
      }),
    );
    expect(restored.theme).toBe(DEFAULTS.theme);
    expect(restored.terminal.cols).toBe(DEFAULTS.terminal.cols);
    expect(restored.terminal.fontSize).toBe(20);
    expect(restored.terminal).not.toHaveProperty("extra");
    expect(restored.connect.tunnelUrl).toBe(DEFAULTS.connect.tunnelUrl);
    expect(restored.connect.config.baudRate).toBe(9600);
    expect(restored.connect.config.parity).toBe(DEFAULTS.connect.config.parity);
    expect(restored.macros).toEqual([{ id: "a", name: "ok", payload: "x" }]);
    expect(restored.tunnelProfiles).toEqual(DEFAULTS.tunnelProfiles);
  });

  it("importJson rejects non-object JSON", () => {
    expect(() => importJson("[]")).toThrow(/object/);
    expect(() => importJson("null")).toThrow(/object/);
  });
});
