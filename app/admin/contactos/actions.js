"use server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente de Supabase del lado del servidor, con la sesión del usuario que
 * está navegando. Mismo patrón que app/auth/callback/route.js. */
function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name, options) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );
}

/** Nadie que no sea admin puede llamar esto, aunque sepa el nombre de la función. */
async function requireAdmin() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");
  const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!prof?.is_admin) throw new Error("No autorizado.");
  return user;
}

/**
 * Trae los teléfonos que SÍ están en la lista de Discord, en los últimos N días.
 *
 * IMPORTANTE — esto es 100% DE SOLO LECTURA:
 *   - No escribe, no borra y no modifica NADA, ni en Supabase ni en Discord.
 *   - Solo hace una petición GET al bot traductor y devuelve números.
 *   - Devuelve únicamente los últimos 8 dígitos de cada número, que es lo
 *     único que se necesita para comparar. Ni productos, ni precios, ni nada más.
 */
export async function getDiscordPhones(days = 60) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!process.env.DISCORD_BOT_URL || !process.env.DISCORD_CHANNEL_ID || !process.env.BOT_IMPORT_SECRET) {
    return {
      ok: false,
      error:
        "Faltan las variables de entorno DISCORD_BOT_URL, DISCORD_CHANNEL_ID o BOT_IMPORT_SECRET en este proyecto de Vercel.",
    };
  }

  // Se limita el rango aunque venga un número raro del navegador.
  const safeDays = Math.min(Math.max(Number(days) || 60, 1), 120);
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const until = new Date();

  const url = `${process.env.DISCORD_BOT_URL}/contacts?channelId=${process.env.DISCORD_CHANNEL_ID}&since=${since.toISOString()}&until=${until.toISOString()}`;

  try {
    const res = await fetch(url, {
      headers: { "x-import-secret": process.env.BOT_IMPORT_SECRET },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `El bot de Discord respondió ${res.status}.` };
    }
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || "No se pudo leer la lista de Discord." };

    // Solo los últimos 8 dígitos: así "+86 135 7603 8204" y "8613576038204"
    // se reconocen como el mismo número aunque estén escritos distinto.
    const phones = [];
    for (const c of data.contacts || []) {
      const digits = (c.phone || "").replace(/[^0-9]/g, "");
      if (digits.length >= 7) phones.push(digits.slice(-8));
    }

    return { ok: true, phones, total: (data.contacts || []).length, days: safeDays };
  } catch (err) {
    return { ok: false, error: `No se pudo conectar con el bot de Discord: ${err.message}` };
  }
}
