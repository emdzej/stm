import { settings } from "./settings.svelte";

/**
 * Install a $effect that keeps the `<html>` class in sync with the chosen
 * theme. "system" tracks `prefers-color-scheme: dark` and updates live when
 * the OS preference changes. Must be called from a component setup context.
 */
export function installThemeApplier(): void {
  if (typeof window === "undefined") return;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");

  $effect(() => {
    const choice = settings.theme;
    const apply = (): void => {
      const dark = choice === "dark" || (choice === "system" && mql.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (choice === "system") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
  });
}
