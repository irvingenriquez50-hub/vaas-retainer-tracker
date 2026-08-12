import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Este endpoint lo llama el motor de WhatsApp cuando cualquier miembro cierra un trato.
// Usa la Service Role Key (nunca se expone al navegador) porque el bot no tiene sesión
// de usuario — necesita permiso elevado para insertar directo saltándose RLS.

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function POST(request) {
  // 1. Verifica el secreto compartido para que nadie más pueda mandar deals falsos
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.BOT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { phone, price, videos, timezone, email } = body || {};

  if (!phone || !price || !videos || !email) {
    return NextResponse.json({ error: "Faltan campos: phone, price, videos, email" }, { status: 400 });
  }

  // 2. Cliente de Supabase con permisos de administrador (server-side únicamente)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 3. A qué usuario le pertenece este deal — se busca por su Gmail, el mismo que usa
  // para entrar tanto al bot como al Retainer Tracker. Cada miembro solo ve lo suyo.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("Error buscando profile por email:", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    console.error(`No existe cuenta en el Retainer Tracker con el correo ${email} — deal no insertado.`);
    return NextResponse.json({ error: `No hay cuenta en el Retainer Tracker con el correo ${email}` }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.from("deals").insert({
    user_id: profile.id,
    telefono: phone,
    precio: Number(price),
    videos: Number(videos),
    timezone: timezone || "china",
    status: "revision", // aparece en "Por revisar" para que el dueño de la cuenta lo acepte o rechace
    mes: monthKey(),
  }).select().single();

  if (error) {
    console.error("Error insertando deal desde el bot:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deal: data });
}
