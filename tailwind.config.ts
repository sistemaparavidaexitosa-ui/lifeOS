import type { Config } from "tailwindcss";

// Design tokens extracted from the reference HTML (LifeOS 4.html) — /docs/UX_MAP.md
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface2)",
        surface3: "var(--surface3)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-d": "var(--accent-d)",
        accent2: "var(--accent2)",
        danger: "var(--danger)",
        warn: "var(--warn)",
        ok: "var(--ok)",
        info: "var(--info)",
        purple: "var(--purple)"
      },
      borderRadius: {
        r: "22px",
        r2: "16px"
      }
    }
  },
  plugins: []
};
export default config;
