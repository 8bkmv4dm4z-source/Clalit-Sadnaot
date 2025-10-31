import React, { useEffect, useState } from "react";

export default function DarkModeToggle() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);

    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      className="p-2 rounded-full bg-white/20 dark:bg-gray-800/40 hover:bg-white/30 dark:hover:bg-gray-700/60 transition-all duration-300 shadow-sm hover:shadow-md"
      aria-label="Toggle dark mode"
    >
      {darkMode ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="#facc15" viewBox="0 0 24 24" className="w-5 h-5">
          <path d="M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364-6.364L17.25 6.75M6.75 17.25l-1.114 1.114M17.25 17.25l1.114 1.114M6.75 6.75 5.636 5.636M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="#93c5fd" viewBox="0 0 24 24" className="w-5 h-5">
          <path d="M21.752 15.002A9 9 0 0 1 9 2.25a9 9 0 1 0 12.752 12.752z" />
        </svg>
      )}
    </button>
  );
}
