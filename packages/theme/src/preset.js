/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: "var(--theme-bg-base)",
        surface: "var(--theme-bg-surface)",
        elevated: "var(--theme-bg-elevated)",
        foreground: "var(--theme-text-foreground)",
        muted: "var(--theme-text-muted)",
        faint: "var(--theme-text-faint)",
        divider: "var(--theme-border-divider)",
        rule: "var(--theme-border-rule)",
        success: "var(--theme-color-success)",
        warning: "var(--theme-color-warning)",
        danger: "var(--theme-color-danger)",
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "JetBrains Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
