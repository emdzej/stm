/**
 * Top-level app state. Svelte 5 runes, mutated directly by components.
 */

export type AppView = "home" | "monitor" | "terminal";
export type TransportKind = "web-serial" | "tunnel";

export interface ConnectionState {
  kind: "disconnected" | "connecting" | "connected" | "error";
  transport?: TransportKind;
  error?: string;
}

interface AppState {
  view: AppView;
  connection: ConnectionState;
  showSettings: boolean;
  showAbout: boolean;
  showConnect: boolean;
  showReconfigure: boolean;
  bannerError: string | null;
}

export const app = $state<AppState>({
  view: "home",
  connection: { kind: "disconnected" },
  showSettings: false,
  showAbout: false,
  showConnect: false,
  showReconfigure: false,
  bannerError: null,
});
