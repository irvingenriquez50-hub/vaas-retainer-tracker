"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { Plus, Pencil, Trash2, MessageCircle, X, ChevronRight, Check, Ban, LogOut, ShieldCheck } from "lucide-react";

const STAGES = [
  { key: "no_solicitado", label: "Muestra no solicitada", color: "#E5484D" },
  { key: "solicitado", label: "Muestra solicitada", color: "#F2994A" },
  { key: "llego", label: "Llegó", color: "#F2C94C" },
  { key: "en_progreso", label: "En progreso", color: "#C9D96B" },
  { key: "posteado", label: "Publicado — pago pendiente", color: "#8FD98F" },
  { key: "pagado", label: "Pagado", color: "#34D399" },
];
const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

const CATEGORIES = [
  { key: "beauty", label: "Beauty", color: "#E879A6" },
  { key: "health", label: "Health/Suplementos", color: "#D9B85C" },
  { key: "electronics", label: "Electronics", color: "#5BB8E8" },
  { key: "otro", label: "Otro", color: "#9CA6B4" },
];
const catInfo = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[3];

const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n || 0);
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const emptyDraft = { marca: "", producto: "", categoria: "health", precio: "", videos: "", telefono: "", email: "" };

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [deals, setDeals] = useState(null);
  const [tab, setTab] = useState("revision");
  const [month, setMonth] = useState(monthKey());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof);
      loadDeals();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDeals = async () => {
    const { data, error } = await supabase.from("deals").select("*").order("created_at", { ascending: false });
    if (error) setError("No se pudieron cargar los contratos.");
    else setDeals(data || []);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const monthDeals = useMemo(
    () => (deals || []).filter((d) => (d.mes || monthKey(new Date(d.created_at))) === month),
    [deals, month]
  );

  const counts = useMemo(() => {
    const revision = monthDeals.filter((d) => d.status === "revision").length;
    const pendiente = monthDeals.filter((d) => !["pagado", "revision", "eliminado"].includes(d.status)).reduce((s, d) => s + Number(d.precio || 0), 0);
    const pagado = monthDeals.filter((d) => d.status === "pagado").reduce((s, d) => s + Number(d.precio || 0), 0);
    const activos = monthDeals.filter((d) => !["pagado", "revision", "eliminado"].includes(d.status)).length;
    return { revision, pendiente, pagado, activos };
  }, [monthDeals]);

  const filtered = useMemo(() => {
    return monthDeals.filter((d) => {
      if (tab === "revision") return d.status === "revision";
      if (tab === "activos") return !["pagado", "revision", "eliminado"].includes(d.status);
      return d.status === "pagado";
    });
  }, [monthDeals, tab]);

  const openAdd = () => {
    setDraft({ ...emptyDraft });
    setEditingId(null);
    setModalOpen(true);
  };
  const openEdit = (deal) => {
    setDraft({ ...deal, precio: String(deal.precio), videos: String(deal.videos), email: deal.email || "" });
    setEditingId(deal.id);
    setModalOpen(true);
  };

  const saveDraft = async () => {
    if (!draft.marca?.trim() || !draft.precio || !draft.videos || (!draft.telefono && !draft.email)) return;
    const { data: { user } } = await supabase.auth.getUser();

    if (editingId) {
      await supabase
        .from("deals")
        .update({ ...draft, precio: Number(draft.precio), videos: Number(draft.videos), updated_at: new Date().toISOString() })
        .eq("id", editingId);
    } else {
      await supabase.from("deals").insert({
        user_id: user.id,
        marca: draft.marca,
        producto: draft.producto || "",
        categoria: draft.categoria || null,
        precio: Number(draft.precio),
        videos: Number(draft.videos),
        telefono: draft.telefono || "",
        email: draft.email || "",
        status: "no_solicitado",
        mes: month,
      });
    }
    setModalOpen(false);
    loadDeals();
  };

  const removeDeal = async (id) => {
    await supabase.from("deals").delete().eq("id", id);
    loadDeals();
  };
  const approveDeal = async (deal) => {
    await supabase.from("deals").update({ status: "no_solicitado" }).eq("id", deal.id);
    loadDeals();
  };
  const rejectDeal = async (deal) => {
    await supabase.from("deals").update({ status: "eliminado" }).eq("id", deal.id);
    loadDeals();
  };
  const advanceStage = async (deal) => {
    const idx = stageIndex(deal.status);
    if (idx === -1 || idx >= STAGES.length - 1) return;
    await supabase.from("deals").update({ status: STAGES[idx + 1].key }).eq("id", deal.id);
    loadDeals();
  };
  const jumpStage = async (deal, key) => {
    await supabase.from("deals").update({ status: key }).eq("id", deal.id);
    loadDeals();
  };

  const waLink = (phone) => {
    const digits = (phone || "").replace(/[^0-9]/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", GOLD_DIM = "#6B5A2A", WHITE = "#F5F3EC", MUTED = "#8C8574";

  return (
    <div className="min-h-screen pb-28" style={{ background: BG, color: WHITE }}>
      <div className="px-5 pt-8 pb-5 flex flex-col items-center relative" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="absolute top-6 right-5 flex gap-2">
          {profile?.is_admin && (
            <button onClick={() => router.push("/admin")} className="p-2 rounded-lg" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <ShieldCheck size={16} color={GOLD} />
            </button>
          )}
          <button onClick={signOut} className="p-2 rounded-lg" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <LogOut size={16} color={MUTED} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-14 h-px vaas-gold-bg" /><div className="w-1 h-1 rounded-full vaas-gold-bg" /><div className="w-14 h-px vaas-gold-bg" />
        </div>
        <div className="font-display font-bold text-4xl tracking-widest leading-none">
          <span style={{ color: WHITE }}>V</span><span className="vaas-gold-text">AA</span><span style={{ color: WHITE }}>S</span>
        </div>
        <div className="text-[11px] tracking-[0.4em] mt-1.5 font-medium">RETAINER TRACKER</div>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-14 h-px vaas-gold-bg" /><div className="w-1 h-1 rounded-full vaas-gold-bg" /><div className="w-14 h-px vaas-gold-bg" />
        </div>

        <div className="flex gap-3 mt-4 w-full">
          <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="text-[11px]" style={{ color: MUTED }}>Pendiente de cobro</div>
            <div className="font-mono-vaas text-lg font-semibold vaas-gold-text">{money(counts.pendiente)}</div>
          </div>
          <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="text-[11px]" style={{ color: MUTED }}>Cobrado</div>
            <div className="font-mono-vaas text-lg font-semibold" style={{ color: "#34D399" }}>{money(counts.pagado)}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-5 pt-4 overflow-x-auto">
        {[
          { key: "revision", label: `Por revisar${counts.revision ? ` (${counts.revision})` : ""}` },
          { key: "activos", label: "Activos" },
          { key: "pagados", label: "Pagados" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0"
            style={tab === t.key ? { background: "linear-gradient(135deg,#B8860B,#E8CD82,#B8860B)", color: "#1A1608" } : { background: SURFACE, color: MUTED, border: `1px solid ${BORDER}` }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "#2A1620", color: "#F19999" }}>{error}</div>}

      <div className="px-5 mt-4 flex flex-col gap-3">
        {deals === null && <div className="text-sm text-center py-10" style={{ color: MUTED }}>Cargando...</div>}
        {deals !== null && filtered.length === 0 && (
          <div className="text-sm text-center py-10" style={{ color: MUTED }}>
            {tab === "revision" && "Nada por revisar este mes."}
            {tab === "activos" && "Sin contratos activos. Toca + para agregar uno."}
            {tab === "pagados" && "Ningún contrato pagado este mes."}
          </div>
        )}

        {filtered.map((deal) => {
          const waL = waLink(deal.telefono);

          if (deal.status === "revision") {
            return (
              <div key={deal.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${GOLD_DIM}` }}>
                <div className="vaas-gold-text text-[10.5px] font-bold mb-1.5">CERRADO POR EL BOT — REVISAR</div>
                <div className="flex items-center gap-4">
                  <span className="vaas-gold-text font-mono-vaas text-lg font-bold">{money(deal.precio)}</span>
                  <span className="text-[13px]" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
                </div>
                <div className="font-mono-vaas text-xs mt-1" style={{ color: MUTED }}>{deal.telefono}</div>
                <div className="flex gap-2 mt-3.5">
                  <button onClick={() => approveDeal(deal)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ background: "#34D399", color: "#06110F" }}>
                    <Check size={16} /> Aceptar
                  </button>
                  <button onClick={() => rejectDeal(deal)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ background: "#2A1620", color: "#F19999" }}>
                    <Ban size={16} /> Rechazar
                  </button>
                </div>
              </div>
            );
          }

          const idx = stageIndex(deal.status);
          const cat = deal.categoria ? catInfo(deal.categoria) : null;
          const stageColor = STAGES[idx]?.color || GOLD_DIM;

          return (
            <div key={deal.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${stageColor}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-base">{deal.marca}</span>
                    {cat && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: `${cat.color}22`, color: cat.color }}>{cat.label}</span>}
                  </div>
                  {deal.producto && <div className="text-xs mt-0.5" style={{ color: MUTED }}>🏷️ {deal.producto}</div>}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => openEdit(deal)} className="p-2 rounded-lg" style={{ background: "#5BB8E822" }}><Pencil size={16} color="#5BB8E8" /></button>
                  <button onClick={() => rejectDeal(deal)} className="p-2 rounded-lg" style={{ background: "#E5484D22" }}><Trash2 size={16} color="#E5484D" /></button>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <span className="vaas-gold-text font-mono-vaas text-base font-semibold">{money(deal.precio)}</span>
                <span className="text-xs" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
                {waL && <a href={waL} target="_blank" rel="noreferrer" className="flex items-center gap-1 ml-auto text-xs" style={{ color: "#22D3C0" }}><MessageCircle size={13} /> WhatsApp</a>}
              </div>

              <div className="mt-3.5">
                <div className="flex items-center">
                  {STAGES.map((s, i) => (
                    <div key={s.key} className="flex items-center flex-1">
                      <button onClick={() => jumpStage(deal, s.key)} className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: i <= idx ? s.color : BORDER }} title={s.label} />
                      {i < STAGES.length - 1 && <div className="flex-1 h-[2px]" style={{ background: i < idx ? STAGES[i + 1].color : BORDER }} />}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10.5px] font-semibold" style={{ color: stageColor }}>{STAGES[idx].label}</span>
                  {idx < STAGES.length - 1 && (
                    <button onClick={() => advanceStage(deal)} className="flex items-center gap-0.5 text-[11px] font-medium" style={{ color: GOLD }}>
                      Siguiente <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={openAdd} className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg vaas-gold-bg">
        <Plus size={26} color="#1A1608" />
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "#000000CC" }}>
          <div className="w-full rounded-t-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, maxWidth: 480 }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-lg">{editingId ? "Editar contrato" : "Nuevo contrato"}</span>
              <button onClick={() => setModalOpen(false)}><X size={20} color={MUTED} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Marca / cliente"><input value={draft.marca} onChange={(e) => setDraft({ ...draft, marca: e.target.value })} style={inputStyle} placeholder="Ej. SkinLab Co." /></Field>
              <Field label="Producto"><input value={draft.producto} onChange={(e) => setDraft({ ...draft, producto: e.target.value })} style={inputStyle} placeholder="Ej. Azelaic Acid Ampoule" /></Field>
              <div className="flex gap-3">
                <Field label="Precio (USD)"><input type="number" value={draft.precio} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} style={inputStyle} placeholder="350" /></Field>
                <Field label="Videos"><input type="number" value={draft.videos} onChange={(e) => setDraft({ ...draft, videos: e.target.value })} style={inputStyle} placeholder="1" /></Field>
              </div>
              <Field label="WhatsApp"><input value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} style={inputStyle} placeholder="+1 555 123 4567" /></Field>
              <Field label="Email (opcional)"><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={inputStyle} placeholder="brand@empresa.com" /></Field>
              <Field label="Categoría">
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button key={c.key} onClick={() => setDraft({ ...draft, categoria: c.key })} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={draft.categoria === c.key ? { background: c.color, color: "#0B0E14" } : { background: BG, color: MUTED }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <button onClick={saveDraft} className="w-full mt-5 py-3 rounded-xl font-semibold text-sm vaas-gold-bg" style={{ color: "#1A1608" }}>
              {editingId ? "Guardar cambios" : "Agregar contrato"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { background: "#000", border: "1px solid #242119", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#F5F3EC", width: "100%", outline: "none" };

function Field({ label, children }) {
  return (
    <div className="flex-1">
      <div className="text-[11.5px] mb-1.5" style={{ color: "#8C8574" }}>{label}</div>
      {children}
    </div>
  );
}
