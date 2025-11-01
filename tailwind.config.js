/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'telegram-blue': '#3390EC',
        'telegram-blue-light': '#5BA8F0',
        'telegram-blue-dark': '#2B7ED6',
        'telegram-bg': '#FFFFFF',
        'telegram-bg-secondary': '#F1F1F1',
        'telegram-text': '#000000',
        'telegram-text-secondary': '#707579',
        'telegram-hover': '#F0F0F0',
      },
    },
  },
  plugins: [],
};
