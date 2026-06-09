"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess("✅ Contraseña actualizada. Redirigiendo…");
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">⚡</span>
          <span className="login-logo-text">FunnelManager</span>
        </div>

        <h1 className="login-title">Nueva contraseña</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading || !ready}
              minLength={6}
            />
          </div>

          <div className="login-field">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading || !ready}
              minLength={6}
            />
          </div>

          {error && <p className="login-error">{error}</p>}
          {success && <p className="login-success">{success}</p>}

          <button
            type="submit"
            className="login-btn"
            disabled={loading || !ready}
          >
            {!ready
              ? "Verificando enlace..."
              : loading
              ? "Guardando..."
              : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
