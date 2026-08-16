/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html", "./popup.html", "./sidepanel.html"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        drop: {
          from: "#6366f1",
          to:   "#8b5cf6",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
        "card-gradient":  "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)",
      },
      animation: {
        "drop-in":    "dropIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fade-up":    "fadeUp 0.3s ease-out both",
        "slide-in":   "slideIn 0.25s ease-out both",
        "liquid":     "liquid 5s ease-in-out infinite",
        "glow":       "glow 2.5s ease-in-out infinite",
        "badge-pop":  "badgePop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "scan-ring":  "scanRing 1.8s ease-out infinite",
      },
      keyframes: {
        dropIn: {
          "0%":   { transform: "scale(0.75) translateY(-12px)", opacity: "0" },
          "100%": { transform: "scale(1) translateY(0)",        opacity: "1" },
        },
        fadeUp: {
          "0%":   { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
        slideIn: {
          "0%":   { transform: "translateX(-8px)", opacity: "0" },
          "100%": { transform: "translateX(0)",    opacity: "1" },
        },
        liquid: {
          "0%,100%": { borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%" },
          "25%":     { borderRadius: "45% 55% 55% 45% / 55% 45% 55% 45%" },
          "50%":     { borderRadius: "30% 60% 70% 40% / 50% 60% 30% 60%" },
          "75%":     { borderRadius: "55% 45% 40% 60% / 40% 55% 45% 55%" },
        },
        glow: {
          "0%,100%": { boxShadow: "0 0 12px 3px rgba(99,102,241,0.35)" },
          "50%":     { boxShadow: "0 0 22px 6px rgba(139,92,246,0.55)" },
        },
        badgePop: {
          "0%":   { transform: "scale(0)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        scanRing: {
          "0%":   { transform: "scale(1)",   opacity: "0.8" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
      borderRadius: {
        "drop": "50% 50% 45% 45% / 60% 60% 40% 40%",
      },
      boxShadow: {
        "glass":  "0 8px 32px 0 rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.6)",
        "card":   "0 2px 12px 0 rgba(0,0,0,0.06)",
        "brand":  "0 4px 20px 0 rgba(99,102,241,0.4)",
        "inner-top": "inset 0 1px 0 rgba(255,255,255,0.15)",
      },
    },
  },
  plugins: [],
};
