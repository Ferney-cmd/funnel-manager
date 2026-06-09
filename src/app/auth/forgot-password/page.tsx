"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/auth/reset-password",
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Revisa tu email — te enviamos un enlace para restablecer tu contraseña.");
    }

    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">⚡</span>
          <span className="login-logo-text">FunnelManager</span>
        </div>

        <h1 className="login-title">Recuperar contraseña</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              disabled={loading}
            />
          </div>

          {error && <p className="login-error">{error}</p>}
          {success && <p className="login-success">{success}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        <p className="login-switch">
          <Link href="/auth/login">← Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
