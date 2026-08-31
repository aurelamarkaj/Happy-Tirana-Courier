import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        "happy-orange": "#FF5500",
        "happy-orange-soft": "#FF5722",
        "happy-black": "#1A1A1A",
        "happy-muted": "#F8F9FA",
        "happy-green": "#0F8B4C",
        "happy-yellow": "#F7C948"
      },
      boxShadow: {
        happy: "0 18px 50px rgba(26, 26, 26, 0.08)",
        dock: "0 -14px 40px rgba(26, 26, 26, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
