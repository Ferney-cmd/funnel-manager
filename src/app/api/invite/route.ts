import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, role, projectId, projectName, inviterName } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Email inválido." },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: "projectId es requerido." },
        { status: 400 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!serviceRoleKey) {
      return NextResponse.json({
        ok: true,
        emailSent: false,
        message:
          "Invitación guardada. Comparte el enlace de registro manualmente.",
      });
    }

    const { createClient: createSupabaseAdmin } = await import(
      "@supabase/supabase-js"
    );
    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const redirectTo =
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`;

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          full_name: email.split("@")[0],
        },
      }
    );

    if (inviteError) {
      const nonCritical =
        inviteError.message?.toLowerCase().includes("already registered") ||
        inviteError.message?.toLowerCase().includes("already been invited") ||
        inviteError.message?.toLowerCase().includes("user already exists");

      if (!nonCritical) {
        return NextResponse.json({
          ok: true,
          emailSent: false,
          message:
            "Invitación guardada. Comparte el enlace de registro manualmente.",
        });
      }
    }

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error interno del servidor.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
