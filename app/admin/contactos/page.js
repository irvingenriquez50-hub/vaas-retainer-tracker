"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  ArrowLeft, RefreshCw, Copy, Check, MessageCircle, Mail, AlertTriangle,
  ChevronDown, ChevronUp, Undo2, Search, Send,
} from "lucide-react";
import { getDiscordPhones } from "./actions";

// Cuántos días hacia atrás se revisan los contratos de los miembros.
const DEALS_DAYS = 30;
// Cuántos días hacia atrás se lee la lista de Discord. A PROPÓSITO es más ancha
// que la de arriba: si mandaste un contacto hace 45 días y el miembro apenas
// cerró el trato esta semana, con una ventana de 30 días saldría marcado como
// "propio" sin serlo. Con 60 días eso no pasa.
const DISCORD_DAYS = 60;

// Las tres etapas. Un contacto sin marca guardada está en "revisar" — ahí caen
// todos los nuevos. De ahí Irving los mueve a "por_mandar" (ya los revisó y
// confirmó que faltan) o directo a "mandado" (resultó que ya estaban mandados).
const VIEWS = [
  { key: "revisar", label: "Por revisar", color: "#D6B860" },
  { key: "por_mandar", label: "Por mandar", color: "#F2994A" },
  { key: "mandado", label: "Ya mandados", color: "#34D399" },
];

// Mini-tracker de avance de cada contacto en "Por mandar" — la misma barrita de
// bolitas que tienen los contratos, pero para el trabajo de estos contactos.
// Se guarda en discord_sent_marks (columna stage), NUNCA en los deals de nadie.
const CONTACT_STAGES = [
  { key: "sin_enviar", label: "Sin escribir", color: "#E5484D" },
  { key: "enviado", label: "Mensaje enviado", color: "#F2994A" },
  { key: "negociando", label: "Negociando", color: "#F2C94C" },
  { key: "cerrado", label: "Trato cerrado", color: "#34D399" },
];
const contactStageIndex = (k) => Math.max(0, CONTACT_STAGES.findIndex((s) => s.key === k));

const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n || 0);
const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
const digitsOf = (s) => (s || "").replace(/[^0-9]/g, "");

/** La llave con la que se recuerda en qué etapa va cada contacto.
 *
 * LLEVA EL user_id ADENTRO A PROPÓSITO. Antes la llave era solo el número, y eso
 * causaba un cruce feo: si dos miembros tenían el mismo contacto (pasa seguido
 * con marcas grandes), compartían la misma marca — mover el de uno movía el del
 * otro, y aparecían contactos "de la nada" en la lista de alguien más. Con el
 * miembro adentro, lo de cada quien queda totalmente aislado.
 *
 * Para los que tienen número se usan sus últimos 8 dígitos (así da igual cómo
 * esté escrito); los que solo tienen correo se recuerdan por el id de su contrato. */
function markKey(deal) {
  const digits = digitsOf(deal.telefono);
  const tail = digits.length >= 7 ? digits.slice(-8) : `deal:${deal.id}`;
  return `${deal.user_id}:${tail}`;
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
  const [marks, setMarks] = useState(new Map()); // phone_key -> { state: "por_mandar" | "mandado", stage }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [view, setView] = useState("revisar");
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
    const { data } = await supabase.from("discord_sent_marks").select("phone_key,state,stage");
    setMarks(new Map((data || []).map((m) => [m.phone_key, { state: m.state || "mandado", stage: m.stage || "sin_enviar" }])));
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

  // ─── Mover un contacto de etapa ───────────────────────────────────────
  // OJO: esto SOLO escribe en la tabla discord_sent_marks, que existe nada más
  // para esta pantalla. NUNCA toca la tabla deals — los contratos de los
  // miembros no se modifican ni se borran por mover nada aquí.
  const moveTo = async (deal, state) => {
    const key = markKey(deal);
    const before = marks.get(key);
    setMarks((prev) => new Map(prev).set(key, { state, stage: before?.stage || "sin_enviar" })); // se ve al instante

    const { error } = await supabase
      .from("discord_sent_marks")
      .upsert(
        {
          phone_key: key,
          phone_full: deal.telefono || deal.email || "",
          marked_by: me?.id || null,
          state,
          // Se manda la etapa EXPLÍCITA en vez de confiar en el valor por defecto
          // de la base — así el guardado no depende de cómo esté configurada la
          // columna del lado de Supabase.
          stage: before?.stage || "sin_enviar",
        },
        { onConflict: "phone_key" }
      );

    if (error) {
      setMarks((prev) => {
        const n = new Map(prev);
        if (before === undefined) n.delete(key); else n.set(key, before);
        return n;
      });
      const msg = `No se pudo guardar el cambio de ${deal.telefono || deal.email || "este contacto"}:\n\n${error.message}`;
      setError(msg);
      window.alert(`⚠️ ${msg}\n\nPor eso el contacto se regresó a su lugar.`);
    }
  };

  // Regresa el contacto a "Por revisar" (borra su marca).
  const backToReview = async (deal) => {
    const key = markKey(deal);
    const before = marks.get(key);
    setMarks((prev) => { const n = new Map(prev); n.delete(key); return n; });

    const { error } = await supabase.from("discord_sent_marks").delete().eq("phone_key", key);
    if (error) {
      setMarks((prev) => new Map(prev).set(key, before));
      const msg = `No se pudo deshacer: ${error.message}`;
      setError(msg);
      window.alert(`⚠️ ${msg}`);
    }
  };

  // Cambia la etapa del mini-tracker de un contacto en "Por mandar".
  // Solo escribe la columna stage de discord_sent_marks — nada más.
  const setStage = async (deal, stage) => {
    const key = markKey(deal);
    const before = marks.get(key);
    if (!before) return; // solo aplica a contactos que ya tienen marca
    setMarks((prev) => new Map(prev).set(key, { ...before, stage }));
    const { error } = await supabase.from("discord_sent_marks").update({ stage }).eq("phone_key", key);
    if (error) {
      setMarks((prev) => new Map(prev).set(key, before));
      const msg = `No se pudo guardar la etapa: ${error.message}`;
      setError(msg);
      window.alert(`⚠️ ${msg}`);
    }
  };

  // ─── Cálculo de las listas ────────────────────────────────────────────
  const { groups, counts, dupTotal } = useMemo(() => {
    if (!profiles || !deals || !discord) return { groups: null, counts: { revisar: 0, por_mandar: 0, mandado: 0 }, dupTotal: 0 };

    const inDiscord = new Set(discord.phones);
    const cutoff = Date.now() - DEALS_DAYS * 24 * 60 * 60 * 1000;
    const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "Sin nombre"]));
    const q = query.trim().toLowerCase();

    // Primera pasada: qué miembros tienen cada número. Sirve para avisar cuando
    // dos personas distintas están trabajando el mismo contacto — así, si ves un
    // número repetido, sabes que es una colisión real y no que se revolvió algo.
    const ownersByPhone = new Map();
    for (const d of deals) {
      if (d.status === "eliminado") continue;
      const dg = digitsOf(d.telefono);
      if (dg.length < 7) continue;
      const k = dg.slice(-8);
      if (!ownersByPhone.has(k)) ownersByPhone.set(k, new Set());
      ownersByPhone.get(k).add(d.user_id);
    }

    const tally = { revisar: 0, por_mandar: 0, mandado: 0 };
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
        unverifiable = true; // Discord no guarda correos, no hay contra qué comparar
      } else {
        continue; // ni teléfono ni correo
      }

      // Los conteos de las tres pestañas se calculan siempre completos, sin que
      // el buscador los altere — así el número de cada pestaña no baila.
      const mark = marks.get(markKey(d));
      const state = mark?.state || "revisar";
      tally[state] = (tally[state] || 0) + 1;
      if (state !== view) continue;

      const name = nameOf.get(d.user_id) || "Sin nombre";
      if (q && ![name, d.marca, d.producto, d.telefono, d.email].some((v) => (v || "").toLowerCase().includes(q))) continue;

      const sharedWith = digits.length >= 7
        ? [...(ownersByPhone.get(digits.slice(-8)) || [])]
            .filter((u) => u !== d.user_id)
            .map((u) => nameOf.get(u) || "otro miembro")
        : [];

      if (!byUser.has(d.user_id)) byUser.set(d.user_id, { userId: d.user_id, name, items: [] });
      byUser.get(d.user_id).items.push({ ...d, unverifiable, sharedWith, stage: mark?.stage || "sin_enviar" });
    }

    const list = [...byUser.values()];
    for (const g of list) g.items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));

    // Repetidos DENTRO de esta misma pestaña. Es el aviso importante: si el
    // mismo número está en la fila de dos miembros, al copiar de los dos lo
    // mandarías dos veces al Discord. Estos se pintan en naranja.
    const seen = new Map();
    for (const g of list) {
      for (const it of g.items) {
        const dg = digitsOf(it.telefono);
        if (dg.length < 7) continue;
        const k = dg.slice(-8);
        if (!seen.has(k)) seen.set(k, []);
        seen.get(k).push(g.name);
      }
    }
    let dupTotal = 0;
    for (const g of list) {
      for (const it of g.items) {
        const dg = digitsOf(it.telefono);
        const names = dg.length >= 7 ? seen.get(dg.slice(-8)) || [] : [];
        it.isDup = names.length > 1;
        it.dupWith = [...new Set(names.filter((n) => n !== g.name))];
        if (it.isDup) dupTotal += 1;
      }
    }

    return { groups: list, counts: tally, dupTotal };
  }, [profiles, deals, discord, marks, view, query]);

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

  const emptyMsg = {
    revisar: query ? "Nada coincide con la búsqueda." : `Nada por revisar — todos los contratos de los últimos ${DEALS_DAYS} días ya están clasificados.`,
    por_mandar: query ? "Nada coincide con la búsqueda." : "Nada en la fila para mandar. Revisa la pestaña de la izquierda.",
    mandado: query ? "Nada coincide con la búsqueda." : "Todavía no has marcado ninguno como mandado.",
  }[view];

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
          {VIEWS.map((v) => {
            const active = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                style={active ? { background: v.color, color: "#0B0E14" } : { background: SURFACE, color: v.color, border: `1px solid ${v.color}38` }}
              >
                {v.label}
                <span className="px-1.5 rounded-full text-[10px] font-bold" style={active ? { background: "#0B0E1426", color: "#0B0E14" } : { background: `${v.color}1F`, color: v.color }}>
                  {counts[v.key] || 0}
                </span>
              </button>
            );
          })}
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

        {!loading && dupTotal > 0 && (
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: "#F2994A14", border: "1px solid #F2994A66" }}>
            <AlertTriangle size={15} color="#F2994A" style={{ flexShrink: 0 }} />
            <div className="flex-1 min-w-0 text-[11.5px]" style={{ color: "#F2994A" }}>
              <span className="font-bold">{dupTotal} repetidos</span> — el mismo número aparece más de una vez aquí.
            </div>
            <button
              onClick={() => {
                const vistos = new Set();
                const bloques = [];
                for (const g of groups || []) {
                  for (const it of g.items) {
                    const dg = digitsOf(it.telefono);
                    const k = dg.length >= 7 ? dg.slice(-8) : `deal:${it.id}`;
                    if (vistos.has(k)) continue;
                    vistos.add(k);
                    bloques.push(discordBlock(it));
                  }
                }
                copy(bloques.join("\n\n"), "dedupe");
              }}
              className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
              style={{ background: "#F2994A", color: "#1A1608" }}
              title="Copia todos los de esta pestaña, contando cada número una sola vez"
            >
              {copiedId === "dedupe" ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Sin repetir</>}
            </button>
          </div>
        )}

        {!loading && groups !== null && groups.length === 0 && (
          <div className="text-[13px] text-center py-10 px-4" style={{ color: MUTED }}>{emptyMsg}</div>
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
                {view !== "mandado" && (
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
                const dup = d.isDup && view !== "mandado";
                return (
                  <div
                    key={d.id}
                    className="px-3 py-2"
                    style={{
                      ...(i > 0 ? { borderTop: `1px solid ${BORDER}` } : {}),
                      ...(dup
                        ? {
                            background: "#F2994A14",
                            borderLeft: "3px solid #F2994A",
                            paddingLeft: 9,
                            boxShadow: "inset 0 0 14px rgba(242,153,74,0.10)",
                          }
                        : {}),
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-vaas text-[12px] font-semibold min-w-0 truncate flex-1">{d.telefono || d.email || "—"}</span>
                      <span className="font-mono-vaas text-[10px] flex-shrink-0" style={{ color: MUTED }}>{shortDate(d.created_at)}</span>

                      {view === "revisar" && (
                        <button onClick={() => moveTo(d, "por_mandar")} className="px-1.5 py-1 rounded flex items-center gap-1 text-[10px] font-bold flex-shrink-0" style={{ background: "#F2994A1F", color: "#F2994A" }} title="Todavía no lo mandamos — pásalo a Por mandar">
                          <Send size={10} /> PM
                        </button>
                      )}

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

                      {view !== "mandado" && (
                        <button onClick={() => copy(discordBlock(d), d.id)} className="p-1 rounded flex-shrink-0" style={{ background: `${GOLD}1F` }} title="Copiar en el formato de Discord">
                          {copiedId === d.id ? <Check size={12} color={GOLD} /> : <Copy size={12} color={GOLD} />}
                        </button>
                      )}

                      {view === "mandado" ? (
                        <button onClick={() => backToReview(d)} className="px-1.5 py-1 rounded flex items-center gap-1 text-[10px] font-semibold flex-shrink-0" style={{ background: "#F2994A1F", color: "#F2994A" }} title="Quitar la marca — regresa a Por revisar">
                          <Undo2 size={11} /> Deshacer
                        </button>
                      ) : (
                        <>
                          {view === "por_mandar" && (
                            <button onClick={() => backToReview(d)} className="p-1 rounded flex-shrink-0" style={{ background: "#8C857420" }} title="Regresar a Por revisar">
                              <Undo2 size={12} color={MUTED} />
                            </button>
                          )}
                          <button onClick={() => moveTo(d, "mandado")} className="px-1.5 py-1 rounded flex items-center gap-1 text-[10px] font-bold flex-shrink-0" style={{ background: "#34D3991F", color: "#34D399" }} title="Ya está en la lista de Discord">
                            <Check size={11} /> Ya
                          </button>
                        </>
                      )}
                    </div>

                    <div className="text-[10.5px] mt-0.5 truncate" style={{ color: MUTED }}>
                      {g.name} · {d.marca || "Sin marca"}
                      {d.producto ? ` · ${d.producto}` : ""}
                      {` · `}
                      <span style={{ color: GOLD }}>{money(d.precio)}</span>
                      {` · ${d.videos || 0} vid`}
                      {d.unverifiable ? " · ⚠️ solo correo, no verificable" : ""}
                    </div>

                    {view === "por_mandar" && (() => {
                      const sIdx = contactStageIndex(d.stage);
                      const sColor = CONTACT_STAGES[sIdx].color;
                      return (
                        <div className="mt-2">
                          <div className="flex items-center">
                            {CONTACT_STAGES.map((s, si) => (
                              <div key={s.key} className="flex items-center flex-1">
                                <button
                                  onClick={() => setStage(d, s.key)}
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ background: si <= sIdx ? CONTACT_STAGES[si].color : BORDER }}
                                  title={s.label}
                                />
                                {si < CONTACT_STAGES.length - 1 && (
                                  <div className="flex-1 h-[2px]" style={{ background: si < sIdx ? CONTACT_STAGES[si + 1].color : BORDER }} />
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] font-semibold" style={{ color: sColor }}>{CONTACT_STAGES[sIdx].label}</span>
                            {sIdx < CONTACT_STAGES.length - 1 && (
                              <button onClick={() => setStage(d, CONTACT_STAGES[sIdx + 1].key)} className="text-[10px] font-medium" style={{ color: GOLD }}>
                                Siguiente →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {dup ? (
                      <div className="text-[10px] mt-1 font-bold truncate" style={{ color: "#F2994A" }}>
                        ⚠️ REPETIDO — {d.dupWith.length > 0
                          ? `este mismo número también está aquí en la lista de ${d.dupWith.join(", ")}. Mándalo una sola vez.`
                          : "este mismo número está dos veces en esta lista. Mándalo una sola vez."}
                      </div>
                    ) : d.sharedWith?.length > 0 ? (
                      <div className="text-[10px] mt-1 truncate" style={{ color: MUTED }}>
                        Este número también lo tiene {d.sharedWith.join(", ")}
                      </div>
                    ) : null}
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
