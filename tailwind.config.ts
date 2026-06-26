import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: "#0f1629",
          foreground: "#94a3b8",
          accent: "#1e2d4a",
          border: "#1e2d4a",
        },
        brand: {
          blue: "#3b82f6",
          green: "#10b981",
          purple: "#8b5cf6",
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  safelist: [
    'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-orange-500',
    'bg-teal-500', 'bg-emerald-500', 'bg-red-500', 'bg-pink-500',
    'bg-fuchsia-500', 'bg-cyan-500', 'bg-amber-500',
  ],
  plugins: [require("tailwindcss-animate")],
};

export default config;
