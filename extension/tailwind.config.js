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
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#a855f7 100%)",
      },
      animation: {
        "drop-in":   "dropIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        "fade-up":   "fadeUp 0.3s ease-out both",
        "slide-in":  "slideIn 0.22s ease-out both",
        "liquid":    "liquid 5s ease-in-out infinite",
        "liquid-fast":"liquid 2.2s ease-in-out infinite",
        "glow":      "glow 2.5s ease-in-out infinite",
        "badge-pop": "badgePop 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        "scan-ring": "scanRing 1.8s ease-out infinite",
        "shimmer":   "shimmer 1.6s linear infinite",
        "ripple":    "ripple 0.55s ease-out forwards",
        "drip":      "drip 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
      },
      keyframes: {
        dropIn:   { "0%": { transform:"scale(0.75) translateY(-12px)", opacity:"0" }, "100%": { transform:"scale(1) translateY(0)", opacity:"1" } },
        fadeUp:   { "0%": { transform:"translateY(10px)", opacity:"0" }, "100%": { transform:"translateY(0)", opacity:"1" } },
        slideIn:  { "0%": { transform:"translateX(-8px)", opacity:"0" }, "100%": { transform:"translateX(0)", opacity:"1" } },
        liquid: {
          "0%,100%": { borderRadius:"60% 40% 30% 70% / 60% 30% 70% 40%" },
          "25%":     { borderRadius:"45% 55% 55% 45% / 55% 45% 55% 45%" },
          "50%":     { borderRadius:"30% 60% 70% 40% / 50% 60% 30% 60%" },
          "75%":     { borderRadius:"55% 45% 40% 60% / 40% 55% 45% 55%" },
        },
        glow: {
          "0%,100%": { boxShadow:"0 0 14px 4px rgba(99,102,241,0.35)" },
          "50%":     { boxShadow:"0 0 26px 8px rgba(139,92,246,0.55)" },
        },
        badgePop:  { "0%": { transform:"scale(0)", opacity:"0" }, "100%": { transform:"scale(1)", opacity:"1" } },
        scanRing:  { "0%": { transform:"scale(1)", opacity:"0.7" }, "100%": { transform:"scale(1.85)", opacity:"0" } },
        shimmer: {
          "0%":   { backgroundPosition:"-200% center" },
          "100%": { backgroundPosition:"200% center" },
        },
        ripple: {
          "0%":   { transform:"scale(0)", opacity:"0.5" },
          "100%": { transform:"scale(4)", opacity:"0" },
        },
        drip: {
          "0%":   { transform:"scaleY(0) translateY(-6px)", opacity:"0" },
          "100%": { transform:"scaleY(1) translateY(0)",    opacity:"1" },
        },
      },
      boxShadow: {
        "water": "0 4px 24px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.85)",
        "water-sm": "0 2px 12px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
        "water-lg": "0 8px 32px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
        "brand":  "0 4px 20px rgba(99,102,241,0.45)",
        "brand-sm": "0 2px 10px rgba(99,102,241,0.3)",
        "card":   "0 2px 12px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        "drop": "50% 50% 50% 50% / 60% 60% 40% 40%",
        "drop-sm": "50% 50% 48% 48% / 55% 55% 45% 45%",
      },
    },
  },
  plugins: [],
};
