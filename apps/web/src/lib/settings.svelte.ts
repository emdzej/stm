import { load, save, type Settings } from "@emdzej/stm-settings";

/**
 * Reactive settings singleton. Reads from localStorage at module init,
 * mutations propagate through the $state proxy, and `installAutoSave()`
 * (called once from a component) writes back on every change.
 */
export const settings = $state<Settings>(load());

/** Install a $effect that persists settings to localStorage on every change.
 * Must be called from a component setup context. */
export function installAutoSave(): void {
  $effect(() => {
    // Stringify reads every property recursively, registering deep deps
    // with the $state proxy. Any nested change re-runs this effect.
    save(settings);
  });
}
