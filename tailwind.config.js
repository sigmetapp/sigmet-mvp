/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
      colors: {
        base: {
          bg: "#0a0f1c",
          panel: "#0b1221",
          ink: "#ffffff",
          inkMuted: "#cdd5e0",
          line: "rgba(255,255,255,0.08)"
        },
        accent: {
          DEFAULT: "#ffffff",
          soft: "rgba(255,255,255,0.08)"
        }
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.35)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  },
  plugins: [require("@tailwindcss/typography"), require("@tailwindcss/line-clamp")]
}
