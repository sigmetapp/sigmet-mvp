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
        'primary-blue': '#3390EC',
        'primary-blue-light': '#5BA8F0',
        'primary-blue-dark': '#2B7ED6',
        'primary-bg': '#FFFFFF',
        'primary-bg-secondary': '#F1F1F1',
        'primary-text': '#000000',
        'primary-text-secondary': '#707579',
        'primary-hover': '#F0F0F0',
      },
    },
  },
  plugins: [],
};
