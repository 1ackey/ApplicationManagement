/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/views/**/*.{ejs,html}",
    "./views/**/*.{ejs,html}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f7ff",
          100: "#e0efff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        secondary: {
          50: "#f9fafb",
          500: "#6b7280",
          600: "#4b5563",
        }
      },
    },
  },
  plugins: [],
}
