"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  ArrowLeft, RefreshCw, Copy, Check, MessageCircle, Mail, AlertTriangle,
  ChevronDown, ChevronUp, Undo2, Search,
} from "lucide-react";
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

/** La llave con la que se recuerda "este ya lo mandé". Para los que tienen
 * número se usan sus últimos 8 dígitos (así da igual cómo esté escrito); los
 * que solo tienen correo se recuerdan por el id de su contrato. */
function markKey(deal) {
  const digits = digitsOf(deal.telefono);
  return digits.length >= 7 ? digits.slice(-8) : `deal:${deal.id}`;
}

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
  const [me, setMe] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [deals, setDeals] = useState(null);
  const [discord, setDiscord] = useState(null);
  const [marks, setMarks] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [showMarked, setShowMarked] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof?.is_admin) return router.replace("/dashboard");
      setMe(user);
      setReady(true);
      loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMarks = async () => {
    const { data } = await supabase.from("discord_sent_marks").select("phone_key");
    setMarks(new Set((data || []).map((m) => m.phone_key)));
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");
    // Como admin, las políticas RLS ya dejan ver todos los perfiles y contratos.
    const [{ data: profs }, { data: dls }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("deals").select("id,user_id,marca,producto,precio,videos,telefono,email,status,created_at"),
      loadMarks(),
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

  // ─── Marcar / desmarcar ───────────────────────────────────────────────
  // OJO: esto SOLO escribe en la tabla discord_sent_marks, que existe nada más
  // para esta pantalla. NUNCA toca la tabla deals — los contratos de los
  // miembros no se modifican ni se borran por marcar aquí.
  const markSent = async (deal) => {
    const key = markKey(deal);
    setMarks((prev) => new Set(prev).add(key)); // se ve al instante
    const { error } = await supabase
      .from("discord_sent_marks")
      .upsert({ phone_key: key, phone_full: deal.telefono || deal.email || "", marked_by: me?.id || null }, { onConflict: "phone_key" });
    if (error) {
      setMarks((prev) => { const n = new Set(prev); n.delete(key); return n; });
      setError(`No se pudo guardar la marca: ${error.message}`);
    }
  };

  const unmark = async (deal) => {
    const key = markKey(deal);
    setMarks((prev) => { const n = new Set(prev); n.delete(key); return n; });
    const { error } = await supabase.from("discord_sent_marks").delete().eq("phone_key", key);
    if (error) {
      setMarks((prev) => new Set(prev).add(key));
      setError(`No se pudo deshacer: ${error.message}`);
    }
  };

  // ─── Cálculo de la lista ──────────────────────────────────────────────
  const { groups, markedCount } = useMemo(() => {
    if (!profiles || !deals || !discord) return { groups: null, markedCount: 0 };

    const inDiscord = new Set(discord.phones);
    const cutoff = Date.now() - DEALS_DAYS * 24 * 60 * 60 * 1000;
    const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "Sin nombre"]));
    const q = query.trim().toLowerCase();

    const byUser = new Map();
    let marked = 0;

    for (const d of deals) {
      if (d.status === "eliminado") continue;
      const created = new Date(d.created_at).getTime();
      if (isNaN(created) || created < cutoff) continue;

      const digits = digitsOf(d.telefono);
      let unverifiable = false;

      if (digits.length >= 7) {
        if (inDiscord.has(digits.slice(-8))) continue; // sí lo mandamos nosotros
      } else if (d.email) {
        unverifiable = true; // Discord no guarda correos, no hay contra qué comparar
      } else {
        continue; // ni teléfono ni correo
      }

      const isMarked = marks.has(markKey(d));
      if (isMarked) marked += 1;
      if (isMarked !== showMarked) continue;

      const name = nameOf.get(d.user_id) || "Sin nombre";
      if (q && ![name, d.marca, d.producto, d.telefono, d.email].some((v) => (v || "").toLowerCase().includes(q))) continue;

      if (!byUser.has(d.user_id)) byUser.set(d.user_id, { userId: d.user_id, name, items: [] });
      byUser.get(d.user_id).items.push({ ...d, unverifiable });
    }

    const list = [...byUser.values()];
    for (const g of list) g.items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
    return { groups: list, markedCount: marked };
  }, [profiles, deals, discord, marks, showMarked, query]);

  const total = useMemo(() => (groups || []).reduce((s, g) => s + g.items.length, 0), [groups]);

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
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1600);
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
      <div className="px-4 pt-5 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2.5">
          <button onClick={() => router.push("/admin")} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: SURFACE }}>
            <ArrowLeft size={15} color={MUTED} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-base leading-tight">Contactos propios</div>
            <div className="text-[10.5px] leading-tight" style={{ color: MUTED }}>
              {DEALS_DAYS}d de contratos · {DISCORD_DAYS}d de Discord{discord ? ` · ${discord.total} en la lista` : ""}
            </div>
          </div>
          <button onClick={loadAll} disabled={loading} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: SURFACE, border: `1px solid ${BORDER}` }} title="Volver a revisar">
            <RefreshCw size={15} color={loading ? GOLD_DIM : GOLD} />
          </button>
        </div>

        <div className="flex gap-1.5 mt-2.5">
          <button
            onClick={() => setShowMarked(false)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
            style={!showMarked ? { background: GOLD, color: "#1A1608" } : { background: SURFACE, color: GOLD, border: `1px solid ${GOLD}38` }}
          >
            Por mandar
            <span className="px-1.5 rounded-full text-[10px] font-bold" style={!showMarked ? { background: "#1A160826", color: "#1A1608" } : { background: `${GOLD}1F`, color: GOLD }}>
              {showMarked ? "·" : total}
            </span>
          </button>
          <button
            onClick={() => setShowMarked(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
            style={showMarked ? { background: "#34D399", color: "#06110F" } : { background: SURFACE, color: "#34D399", border: "1px solid #34D39938" }}
          >
            Ya mandados
            <span className="px-1.5 rounded-full text-[10px] font-bold" style={showMarked ? { background: "#06110F26", color: "#06110F" } : { background: "#34D3991F", color: "#34D399" }}>
              {showMarked ? total : markedCount}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 mt-2" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <Search size={13} color={MUTED} style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar miembro, marca, producto o número..."
            className="bg-transparent outline-none flex-1 text-[12px]"
            style={{ color: WHITE }}
          />
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-[11.5px] flex items-start gap-2" style={{ background: "#2A1620", color: "#F19999", border: "1px solid #4A2530" }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="px-4 mt-3 flex flex-col gap-3">
        {loading && <div className="text-sm text-center py-10" style={{ color: MUTED }}>Revisando la lista de Discord...</div>}

        {!loading && groups !== null && groups.length === 0 && (
          <div className="text-[13px] text-center py-10 px-4" style={{ color: MUTED }}>
            {query
              ? "Nada coincide con la búsqueda."
              : showMarked
              ? "Todavía no has marcado ninguno como mandado."
              : `Todo al día — todos los contratos de los últimos ${DEALS_DAYS} días salieron de la lista de Discord.`}
          </div>
        )}

        {!loading && (groups || []).map((g) => {
          const isCollapsed = !!collapsed[g.userId];
          return (
            <div key={g.userId} className="rounded-xl overflow-hidden" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#131210", borderBottom: isCollapsed ? "none" : `1px solid ${BORDER}` }}>
                <button onClick={() => setCollapsed((c) => ({ ...c, [g.userId]: !isCollapsed }))} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                  {isCollapsed ? <ChevronDown size={14} color={MUTED} /> : <ChevronUp size={14} color={MUTED} />}
                  <span className="font-display font-bold text-[13px] truncate">{g.name}</span>
                  <span className="px-1.5 rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: `${GOLD}22`, color: GOLD }}>{g.items.length}</span>
                </button>
                {!showMarked && (
                  <button
                    onClick={() => copy(g.items.map(discordBlock).join("\n\n"), `all_${g.userId}`)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 flex-shrink-0"
                    style={{ background: BG, color: GOLD, border: `1px solid ${BORDER}` }}
                    title="Copiar todos en el formato de Discord"
                  >
                    {copiedId === `all_${g.userId}` ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Todos</>}
                  </button>
                )}
              </div>

              {!isCollapsed && g.items.map((d, i) => {
                const waDigits = digitsOf(d.telefono);
                return (
                  <div key={d.id} className="px-3 py-2" style={i > 0 ? { borderTop: `1px solid ${BORDER}` } : undefined}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-vaas text-[12px] font-semibold min-w-0 truncate flex-1">{d.telefono || d.email || "—"}</span>
                      <span className="font-mono-vaas text-[10px] flex-shrink-0" style={{ color: MUTED }}>{shortDate(d.created_at)}</span>

                      {waDigits.length >= 7 && (
                        <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" className="p-1 rounded flex-shrink-0" style={{ background: "#22D3C01F" }} title="Abrir en WhatsApp">
                          <MessageCircle size={12} color="#22D3C0" />
                        </a>
                      )}
                      {d.email && (
                        <a href={`mailto:${d.email}`} className="p-1 rounded flex-shrink-0" style={{ background: `${GOLD}1F` }} title={d.email}>
                          <Mail size={12} color={GOLD} />
                        </a>
                      )}

                      {showMarked ? (
                        <button onClick={() => unmark(d)} className="px-1.5 py-1 rounded flex items-center gap-1 text-[10px] font-semibold flex-shrink-0" style={{ background: "#F2994A1F", color: "#F2994A" }} title="Quitar la marca — vuelve a Por mandar">
                          <Undo2 size={11} /> Deshacer
                        </button>
                      ) : (
                        <>
                          <button onClick={() => copy(discordBlock(d), d.id)} className="p-1 rounded flex-shrink-0" style={{ background: `${GOLD}1F` }} title="Copiar en el formato de Discord">
                            {copiedId === d.id ? <Check size={12} color={GOLD} /> : <Copy size={12} color={GOLD} />}
                          </button>
                          <button onClick={() => markSent(d)} className="px-1.5 py-1 rounded flex items-center gap-1 text-[10px] font-semibold flex-shrink-0" style={{ background: "#34D3991F", color: "#34D399" }} title="Ya lo mandé al Discord — quítalo de esta lista">
                            <Check size={11} /> Ya
                          </button>
                        </>
                      )}
                    </div>

                    <div className="text-[10.5px] mt-0.5 truncate" style={{ color: MUTED }}>
                      {d.marca || "Sin marca"}
                      {d.producto ? ` · ${d.producto}` : ""}
                      {` · `}
                      <span style={{ color: GOLD }}>{money(d.precio)}</span>
                      {` · ${d.videos || 0} vid`}
                      {d.unverifiable ? " · ⚠️ solo correo, no verificable" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
