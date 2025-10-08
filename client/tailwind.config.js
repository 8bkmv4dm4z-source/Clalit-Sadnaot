/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class", // 👈 חובה! אומר לטיילווינד להפעיל מצב כהה לפי מחלקה
  theme: {
    extend: {
      fontFamily: {
        heading: ["Poppins", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        blue: {
          350: "#4c9fff", // גוון ביניים בשביל הגרדיאנט שלך
        },
      },
    },
  },
  plugins: [],
};
