/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        secondary: '#7c3aed',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      }
    },
  },
  plugins: [],
}
