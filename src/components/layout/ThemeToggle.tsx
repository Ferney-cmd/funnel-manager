"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light",  icon: "☀", label: "Claro"   },
  { value: "dark",   icon: "🌙", label: "Oscuro"  },
  { value: "system", icon: "🖥", label: "Sistema" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Evita el mismatch de hidratación (next-themes resuelve el tema en cliente)
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="theme-toggle" style={{ width: 96 }} />;

  const current = theme ?? "system";

  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`theme-toggle-btn${current === o.value ? " active" : ""}`}
          onClick={() => setTheme(o.value)}
          title={o.label}
          aria-pressed={current === o.value}
        >
          <span aria-hidden>{o.icon}</span>
        </button>
      ))}
    </div>
  );
}
