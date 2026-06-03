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
    const json = exportJson(custom);
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
});
