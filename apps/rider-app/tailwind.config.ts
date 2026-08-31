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
        "happy-muted": "#F8F9FA"
      },
      boxShadow: {
        happy: "0 18px 50px rgba(26, 26, 26, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
