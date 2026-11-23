import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function apply(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      /* ignore */
    }
    const initial =
      stored === "light" || stored === "dark"
        ? stored
        : document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
    setTheme(initial);
    apply(initial);
  }, []);

  return (
    <button
      type="button"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        apply(next);
      }}
      className="group relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card text-primary shadow-sm transition-all duration-200 hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="absolute inset-x-1 top-0 h-px bg-primary/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      {theme === "dark" ? (
        <Sun className="size-4 transition-transform duration-200 group-hover:rotate-45" />
      ) : (
        <Moon className="size-4 transition-transform duration-200 group-hover:-rotate-12" />
      )}
    </button>
  );
}
