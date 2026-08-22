"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { ArrowLeft, RefreshCw, Copy, Check, MessageCircle, Mail, AlertTriangle } from "lucide-react";
import { getDiscordPhones } from "./actions";

// Cuántos días hacia atrás se revisan los contratos de los miembros.
const DEALS_DAYS = 30;
// Cuántos días hacia atrás se lee la lista de Discord. A PROPÓSITO es más ancha
// que la de arriba: si mandaste un contacto hace 45 días y el miembro apenas
// cerró el trato esta semana, con una ventana de 30 días saldría marcado como
// "propio" sin serlo. Con 60 días eso no pasa.
const DISCORD_DAYS = 60;

const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n || 0);
const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
const digitsOf = (s) => (s || "").replace(/[^0-9]/g, "");

/** El bloque en el formato EXACTO que lee el bot de Discord, listo para pegar
 * en el canal. Así el contacto entra a la lista sin escribir nada a mano. */
function discordBlock(deal) {
  const raw = (deal.telefono || "").trim();
  const phone = raw.startsWith("+") ? raw : `+${raw}`;
  const lines = [`📱 Contact: ${phone}`, `🎯 Product: ${deal.producto || "—"}`];
  if (deal.videos) lines.push(`🎥 ${deal.videos} Videos`);
  if (deal.precio) lines.push(`💰 $${Number(deal.precio)}`);
  return lines.join("\n");
}

export default function AdminContactosPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState(null);
  const [deals, setDeals] = useState(null);
  const [discord, setDiscord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof?.is_admin) return router.replace("/dashboard");
      setReady(true);
      loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    // Como admin, las políticas RLS ya dejan ver todos los perfiles y contratos.
    const [{ data: profs }, { data: dls }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("deals").select("id,user_id,marca,producto,precio,videos,telefono,email,status,created_at"),
    ]);
    setProfiles(profs || []);
    setDeals(dls || []);

    const res = await getDiscordPhones(DISCORD_DAYS);
    if (!res?.ok) {
      setDiscord(null);
      setError(res?.error || "No se pudo leer la lista de Discord.");
    } else {
      setDiscord(res);
    }
    setLoading(false);
  };

  // Contactos que los miembros consiguieron por su cuenta: están en su tracker
  // pero NO aparecen en la lista de Discord.
  const groups = useMemo(() => {
    if (!profiles || !deals || !discord) return null;

    const inDiscord = new Set(discord.phones);
    const cutoff = Date.now() - DEALS_DAYS * 24 * 60 * 60 * 1000;
    const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "Sin nombre"]));

    const byUser = new Map();
    for (const d of deals) {
      if (d.status === "eliminado") continue;
      const created = new Date(d.created_at).getTime();
      if (isNaN(created) || created < cutoff) continue;

      const digits = digitsOf(d.telefono);
      let unverifiable = false;

      if (digits.length >= 7) {
        if (inDiscord.has(digits.slice(-8))) continue; // sí lo mandamos nosotros
      } else if (d.email) {
        // Sin número usable pero con correo: la lista de Discord no guarda
        // correos, así que este no se puede comprobar contra nada.
        unverifiable = true;
      } else {
        continue; // ni teléfono ni correo — no hay nada que revisar
      }

      const key = d.user_id;
      if (!byUser.has(key)) byUser.set(key, { userId: key, name: nameOf.get(key) || "Sin nombre", items: [] });
      byUser.get(key).items.push({ ...d, unverifiable });
    }

    const list = [...byUser.values()];
    for (const g of list) g.items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
    return list;
  }, [profiles, deals, discord]);

  const totalMissing = useMemo(() => (groups || []).reduce((s, g) => s + g.items.length, 0), [groups]);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", GOLD_DIM = "#6B5A2A", MUTED = "#8C8574", WHITE = "#F5F3EC";

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG, color: MUTED }}>
        <span className="font-mono-vaas text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: BG, color: WHITE }}>
      <div className="px-5 pt-6 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="p-2 rounded-lg flex-shrink-0" style={{ background: SURFACE }}>
            <ArrowLeft size={16} color={MUTED} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg">Contactos propios</div>
            <div className="text-xs" style={{ color: MUTED }}>Contratos que no salieron de la lista de Discord</div>
          </div>
          <button onClick={loadAll} disabled={loading} className="p-2 rounded-lg flex-shrink-0" style={{ background: SURFACE, border: `1px solid ${BORDER}` }} title="Volver a revisar">
            <RefreshCw size={16} color={loading ? GOLD_DIM : GOLD} />
          </button>
        </div>

        <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <div className="text-[11px]" style={{ color: MUTED }}>Encontrados</div>
          <div className="font-mono-vaas text-lg font-semibold vaas-gold-text">
            {groups === null ? "—" : `${totalMissing} contacto${totalMissing === 1 ? "" : "s"}`}
          </div>
          <div className="text-[10.5px] mt-1" style={{ color: MUTED }}>
            Contratos de los últimos {DEALS_DAYS} días, comparados contra los últimos {DISCORD_DAYS} días de Discord
            {discord ? ` (${discord.total} contactos en la lista).` : "."}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 px-3 py-2.5 rounded-lg text-xs flex items-start gap-2" style={{ background: "#2A1620", color: "#F19999", border: "1px solid #4A2530" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="px-5 mt-4 flex flex-col gap-5">
        {loading && <div className="text-sm text-center py-10" style={{ color: MUTED }}>Revisando la lista de Discord...</div>}

        {!loading && groups !== null && groups.length === 0 && (
          <div className="text-sm text-center py-10" style={{ color: MUTED }}>
            Todo al día — todos los contratos de los últimos {DEALS_DAYS} días salieron de la lista de Discord.
          </div>
        )}

        {!loading && (groups || []).map((g) => (
          <div key={g.userId}>
            <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="font-display font-bold text-[15px] flex-1 min-w-0 truncate">{g.name}</div>
              <div className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: `${GOLD}22`, color: GOLD }}>
                {g.items.length}
              </div>
              <button
                onClick={() => copy(g.items.map(discordBlock).join("\n\n"), `all_${g.userId}`)}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 flex-shrink-0"
                style={{ background: SURFACE, color: GOLD, border: `1px solid ${BORDER}` }}
                title="Copiar todos en el formato de Discord"
              >
                {copiedId === `all_${g.userId}` ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Todos</>}
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {g.items.map((d) => {
                const waDigits = digitsOf(d.telefono);
                return (
                  <div key={d.id} className="rounded-xl p-3.5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD_DIM}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono-vaas text-[13px] font-semibold min-w-0 truncate">
                        {d.telefono || d.email || "—"}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-vaas" style={{ background: BORDER, color: MUTED }}>{shortDate(d.created_at)}</span>
                        <button
                          onClick={() => copy(discordBlock(d), d.id)}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1"
                          style={{ background: `${GOLD}22`, color: GOLD }}
                          title="Copiar en el formato que lee el bot de Discord"
                        >
                          {copiedId === d.id ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
                        </button>
                      </div>
                    </div>

                    <div className="text-xs mt-1.5" style={{ color: MUTED }}>
                      {d.marca || "Sin marca"}{d.producto ? ` · 🏷️ ${d.producto}` : ""}
                    </div>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="vaas-gold-text font-mono-vaas text-sm font-semibold">{money(d.precio)}</span>
                      <span className="text-xs" style={{ color: MUTED }}>🎥 {d.videos} videos</span>
                      <div className="flex items-center gap-3 ml-auto">
                        {waDigits.length >= 7 && (
                          <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "#22D3C0" }}>
                            <MessageCircle size={13} /> WhatsApp
                          </a>
                        )}
                        {d.email && (
                          <a href={`mailto:${d.email}`} className="flex items-center gap-1 text-xs" style={{ color: GOLD }}>
                            <Mail size={13} /> Email
                          </a>
                        )}
                      </div>
                    </div>

                    {d.unverifiable && (
                      <div className="mt-2 px-2.5 py-1.5 rounded-lg text-[11px] flex items-start gap-1.5" style={{ background: "#F2994A15", color: "#F2994A" }}>
                        <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                        Solo tiene correo — la lista de Discord no guarda correos, así que este no se pudo comprobar.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
