/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html", "./popup.html", "./sidepanel.html"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#e0e8ff",
          500: "#4f6ef7",
          600: "#3b57e8",
          700: "#2d46d6",
        },
      },
    },
  },
  plugins: [],
};
