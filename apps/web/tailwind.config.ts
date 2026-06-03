import type { Config } from "tailwindcss";
import stmPreset from "@emdzej/stm-theme";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,svelte}",
    "../../packages/ui/src/**/*.{ts,svelte}",
  ],
  presets: [stmPreset],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#3b82f6",
          muted: "#1d4ed8",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
