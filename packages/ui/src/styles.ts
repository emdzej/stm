/**
 * Shared Tailwind class strings. Imported as constants rather than wrapped
 * in a component so consumers can compose with extra utilities (e.g. add
 * `flex-1`, override padding) without prop plumbing.
 */

export const BUTTON_SECONDARY =
  "rounded border border-divider bg-surface px-2 py-0.5 text-muted transition hover:border-rule hover:bg-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

export const BUTTON_PRIMARY =
  "rounded bg-accent px-3 py-1 text-white transition hover:bg-accent-muted disabled:pointer-events-none disabled:opacity-50";

export const BUTTON_DANGER =
  "rounded border border-danger bg-surface px-2 py-0.5 text-danger transition hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-50";
