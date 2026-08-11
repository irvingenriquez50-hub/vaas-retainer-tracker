"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  Plus, Pencil, Trash2, MessageCircle, Mail, X, ChevronRight, ChevronLeft,
  Check, Ban, Calendar, BookOpen, Link2, FileText, RotateCcw, XCircle,
  Languages, LogOut, ShieldCheck,
} from "lucide-react";

const STRINGS = {
  pending_collect: { es: "Pendiente de cobro", en: "Pending collection" },
  collected: { es: "Cobrado", en: "Collected" },
  tab_revision: { es: "Por revisar", en: "To review" },
  tab_activos: { es: "Activos", en: "Active" },
  tab_pagados: { es: "Pagados", en: "Paid" },
  tab_eliminados: { es: "Eliminados", en: "Deleted" },
  search_placeholder: { es: "Buscar marca o producto...", en: "Search brand or product..." },
  loading: { es: "Cargando...", en: "Loading..." },
  empty_revision: { es: "Nada por revisar este mes.", en: "Nothing to review this month." },
  empty_activos: { es: "Sin contratos activos este mes. Toca + para agregar uno.", en: "No active contracts this month. Tap + to add one." },
  empty_pagados: { es: "Ningún contrato pagado este mes.", en: "No paid contracts this month." },
  empty_eliminados: { es: "Nada eliminado este mes.", en: "Nothing deleted this month." },
  bot_closed: { es: "CERRADO POR EL BOT — REVISAR", en: "CLOSED BY THE BOT — REVIEW" },
  accept: { es: "Aceptar", en: "Accept" },
  reject: { es: "Rechazar", en: "Reject" },
  no_name_yet: { es: "Sin nombre todavía", en: "No name yet" },
  deletes_in: { es: "se borra en", en: "deletes in" },
  restore: { es: "Restaurar", en: "Restore" },
  delete_now: { es: "Eliminar ya", en: "Delete now" },
  next: { es: "Siguiente", en: "Next" },
  new_contract: { es: "Nuevo contrato", en: "New contract" },
  edit_contract: { es: "Editar contrato", en: "Edit contract" },
  brand_client: { es: "Marca / cliente", en: "Brand / client" },
  product: { es: "Producto", en: "Product" },
  price_usd: { es: "Precio (USD)", en: "Price (USD)" },
  videos: { es: "Videos", en: "Videos" },
  whatsapp_field: { es: "WhatsApp (con código de país)", en: "WhatsApp (with country code)" },
  email_optional: { es: "Email (opcional)", en: "Email (optional)" },
  category: { es: "Categoría", en: "Category" },
  contact_timezone: { es: "Horario del contacto", en: "Contact's timezone" },
  save_changes: { es: "Guardar cambios", en: "Save changes" },
  add_contract: { es: "Agregar contrato", en: "Add contract" },
  notes_title: { es: "Notas", en: "Notes" },
  scripts_title: { es: "Escritos", en: "Scripts" },
  scripts_placeholder: { es: "Pega el escrito que te pidieron...", en: "Paste the script they asked for..." },
  links_title: { es: "Links de referencia (TikTok, etc.)", en: "Reference links (TikTok, etc.)" },
  notes_placeholder: { es: "Ej. Ocupa revisión antes de postear...", en: "E.g. Needs review before posting..." },
  save_error: { es: "No se pudo guardar. Intenta de nuevo.", en: "Couldn't save. Try again." },
  collab_one: { es: "colaboración", en: "collaboration" },
  collab_many: { es: "colaboraciones", en: "collaborations" },
  video_one: { es: "video", en: "video" },
  video_many: { es: "videos", en: "videos" },
};

const STAGE_KEYS = ["no_solicitado", "solicitado", "llego", "en_progreso", "posteado", "pagado"];
const STAGE_COLORS = { no_solicitado: "#E5484D", solicitado: "#F2994A", llego: "#F2C94C", en_progreso: "#C9D96B", posteado: "#8FD98F", pagado: "#34D399" };
const STAGE_LABELS = {
  no_solicitado: { es: "Muestra no solicitada", en: "Sample not requested" },
  solicitado: { es: "Muestra solicitada", en: "Sample requested" },
  llego: { es: "Llegó", en: "Arrived" },
  en_progreso: { es: "En progreso", en: "In progress" },
  posteado: { es: "Publicado — pago pendiente", en: "Posted — payment pending" },
  pagado: { es: "Pagado", en: "Paid" },
};
const stageIndex = (key) => STAGE_KEYS.indexOf(key);

const CATEGORIES = [
  { key: "beauty", label: { es: "Beauty", en: "Beauty" }, color: "#E879A6" },
  { key: "health", label: { es: "Health/Suplementos", en: "Health/Supplements" }, color: "#D9B85C" },
  { key: "electronics", label: { es: "Electronics", en: "Electronics" }, color: "#5BB8E8" },
  { key: "otro", label: { es: "Otro", en: "Other" }, color: "#9CA6B4" },
];
const catInfo = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[3];

const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n || 0);
const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key, lang) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { month: "long", year: "numeric" });
};
const MONTH_NAMES = {
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const TZ_INFO = { china: { flag: "🇨🇳", es: "China", en: "China" }, us: { flag: "🇺🇸", es: "US", en: "US" } };

const emptyDraft = { marca: "", producto: "", categoria: "health", precio: "", videos: "", telefono: "", email: "", timezone: "china" };

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [lang, setLang] = useState("es");
  const t = (key) => STRINGS[key]?.[lang] || key;

  const [profile, setProfile] = useState(null);
  const [deals, setDeals] = useState(null);
  const [tab, setTab] = useState("activos");
  const [month, setMonth] = useState(monthKey());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [notesDealId, setNotesDealId] = useState(null);
  const [newScript, setNewScript] = useState("");
  const [newLink, setNewLink] = useState("");

  useEffect(() => {
    const savedLang = typeof window !== "undefined" ? localStorage.getItem("vaas-lang") : null;
    if (savedLang) setLang(savedLang);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof);
      loadDeals();

      const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("deals").delete().eq("user_id", user.id).eq("status", "eliminado").lt("deleted_at", THIRTY_DAYS_AGO);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDeals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("deals").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) setError("No se pudieron cargar los contratos.");
    else setDeals(data || []);
  };

  const switchLang = (l) => {
    setLang(l);
    if (typeof window !== "undefined") localStorage.setItem("vaas-lang", l);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const availableMonths = useMemo(() => {
    const list = deals || [];
    const set = new Set(list.map((d) => d.mes || monthKey(new Date(d.created_at))));
    set.add(monthKey());
    set.add(month);
    return [...set].sort().reverse();
  }, [deals, month]);

  const monthDeals = useMemo(() => (deals || []).filter((d) => (d.mes || monthKey(new Date(d.created_at))) === month), [deals, month]);

  const counts = useMemo(() => {
    const revision = monthDeals.filter((d) => d.status === "revision").length;
    const pendienteDeals = monthDeals.filter((d) => !["pagado", "revision", "eliminado"].includes(d.status));
    const pagadoDeals = monthDeals.filter((d) => d.status === "pagado");
    const pendiente = pendienteDeals.reduce((s, d) => s + Number(d.precio || 0), 0);
    const pagado = pagadoDeals.reduce((s, d) => s + Number(d.precio || 0), 0);
    const pendienteVideos = pendienteDeals.reduce((s, d) => s + Number(d.videos || 0), 0);
    const pagadoVideos = pagadoDeals.reduce((s, d) => s + Number(d.videos || 0), 0);
    const activos = pendienteDeals.length;
    const eliminados = monthDeals.filter((d) => d.status === "eliminado").length;
    return { revision, pendiente, pagado, activos, eliminados, pendienteColabs: pendienteDeals.length, pagadoColabs: pagadoDeals.length, pendienteVideos, pagadoVideos };
  }, [monthDeals]);

  const filtered = useMemo(() => {
    const base = monthDeals.filter((d) => {
      if (tab === "revision") return d.status === "revision";
      if (tab === "activos") return !["pagado", "revision", "eliminado"].includes(d.status);
      if (tab === "eliminados") return d.status === "eliminado";
      return d.status === "pagado";
    });
    const q = query.trim().toLowerCase();
    const searched = q ? base.filter((d) => `${d.marca} ${d.producto}`.toLowerCase().includes(q)) : base;
    return [...searched].sort((a, b) => new Date(a.deleted_at || a.created_at) - new Date(b.deleted_at || b.created_at));
  }, [monthDeals, tab, query]);

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
      await supabase.from("deals").update({
        marca: draft.marca, producto: draft.producto || "", categoria: draft.categoria || null,
        precio: Number(draft.precio), videos: Number(draft.videos), telefono: draft.telefono || "",
        email: draft.email || "", timezone: draft.timezone || "china", updated_at: new Date().toISOString(),
      }).eq("id", editingId);
    } else {
      await supabase.from("deals").insert({
        user_id: user.id, marca: draft.marca, producto: draft.producto || "", categoria: draft.categoria || null,
        precio: Number(draft.precio), videos: Number(draft.videos), telefono: draft.telefono || "",
        email: draft.email || "", timezone: draft.timezone || "china", status: "no_solicitado", mes: month,
      });
    }
    setModalOpen(false);
    loadDeals();
  };

  const removeDealPermanent = async (id) => {
    await supabase.from("deals").delete().eq("id", id);
    loadDeals();
  };
  const approveDeal = async (deal) => {
    await supabase.from("deals").update({ status: "no_solicitado" }).eq("id", deal.id);
    loadDeals();
  };
  const sendToTrash = async (deal) => {
    await supabase.from("deals").update({ status: "eliminado", deleted_at: new Date().toISOString() }).eq("id", deal.id);
    loadDeals();
  };
  const restoreDeal = async (deal) => {
    await supabase.from("deals").update({ status: "no_solicitado", deleted_at: null }).eq("id", deal.id);
    loadDeals();
  };
  const advanceStage = async (deal) => {
    const idx = stageIndex(deal.status);
    if (idx === -1 || idx >= STAGE_KEYS.length - 1) return;
    await supabase.from("deals").update({ status: STAGE_KEYS[idx + 1] }).eq("id", deal.id);
    loadDeals();
  };
  const jumpStage = async (deal, key) => {
    await supabase.from("deals").update({ status: key }).eq("id", deal.id);
    loadDeals();
  };
  const toggleTimezone = async (deal) => {
    await supabase.from("deals").update({ timezone: deal.timezone === "us" ? "china" : "us" }).eq("id", deal.id);
    loadDeals();
  };

  const notesDeal = (deals || []).find((d) => d.id === notesDealId) || null;
  const updateNotes = async (dealId, patch) => {
    const current = (deals || []).find((d) => d.id === dealId);
    const nextNotes = { scripts: [], links: [], notas: "", ...(current?.notes || {}), ...patch };
    await supabase.from("deals").update({ notes: nextNotes }).eq("id", dealId);
    loadDeals();
  };
  const addScript = () => {
    if (!newScript.trim() || !notesDeal) return;
    const scripts = [...(notesDeal.notes?.scripts || []), { id: `s_${Date.now()}`, text: newScript.trim() }];
    updateNotes(notesDeal.id, { scripts });
    setNewScript("");
  };
  const removeScript = (id) => updateNotes(notesDeal.id, { scripts: (notesDeal.notes?.scripts || []).filter((s) => s.id !== id) });
  const addLink = () => {
    if (!newLink.trim() || !notesDeal) return;
    const links = [...(notesDeal.notes?.links || []), { id: `l_${Date.now()}`, url: newLink.trim() }];
    updateNotes(notesDeal.id, { links });
    setNewLink("");
  };
  const removeLink = (id) => updateNotes(notesDeal.id, { links: (notesDeal.notes?.links || []).filter((l) => l.id !== id) });
  const notesCount = (deal) => (deal.notes?.scripts?.length || 0) + (deal.notes?.links?.length || 0) + (deal.notes?.notas?.trim() ? 1 : 0);

  const waLink = (phone) => {
    const digits = (phone || "").replace(/[^0-9]/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", GOLD_DIM = "#6B5A2A", WHITE = "#F5F3EC", MUTED = "#8C8574";

  return (
    <div className="min-h-screen pb-28" style={{ background: BG, color: WHITE }}>
      <div className="px-5 pt-8 pb-5 flex flex-col items-center relative" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="absolute top-6 right-5 flex gap-2">
          <button onClick={() => switchLang(lang === "es" ? "en" : "es")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold" style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: GOLD }}>
            <Languages size={13} /> {lang === "es" ? "EN" : "ES"}
          </button>
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
            <div className="text-[11px]" style={{ color: MUTED }}>{t("pending_collect")}</div>
            <div className="font-mono-vaas text-lg font-semibold vaas-gold-text">{money(counts.pendiente)}</div>
            <div className="font-mono-vaas text-[10.5px] mt-1" style={{ color: MUTED }}>
              {counts.pendienteColabs} {counts.pendienteColabs === 1 ? t("collab_one") : t("collab_many")} · {counts.pendienteVideos} {counts.pendienteVideos === 1 ? t("video_one") : t("video_many")}
            </div>
          </div>
          <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="text-[11px]" style={{ color: MUTED }}>{t("collected")}</div>
            <div className="font-mono-vaas text-lg font-semibold" style={{ color: "#34D399" }}>{money(counts.pagado)}</div>
            <div className="font-mono-vaas text-[10.5px] mt-1" style={{ color: MUTED }}>
              {counts.pagadoColabs} {counts.pagadoColabs === 1 ? t("collab_one") : t("collab_many")} · {counts.pagadoVideos} {counts.pagadoVideos === 1 ? t("video_one") : t("video_many")}
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center mt-3.5 w-full">
          <button
            onClick={() => { setPickerYear(Number(month.split("-")[0])); setMonthPickerOpen((o) => !o); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <Calendar size={16} color={GOLD} />
            <span className="capitalize text-sm font-semibold">{monthLabel(month, lang)}</span>
          </button>

          {monthPickerOpen && (
            <div className="absolute top-full mt-2 z-40 rounded-xl p-3" style={{ background: SURFACE, border: `1px solid ${GOLD_DIM}`, width: 260, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setPickerYear((y) => y - 1)} className="p-1.5 rounded-lg" style={{ background: BG }}><ChevronLeft size={16} color={MUTED} /></button>
                <span className="font-mono-vaas text-sm font-semibold" style={{ color: GOLD }}>{pickerYear}</span>
                <button onClick={() => setPickerYear((y) => y + 1)} className="p-1.5 rounded-lg" style={{ background: BG }}><ChevronRight size={16} color={MUTED} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTH_NAMES[lang].map((name, i) => {
                  const key = `${pickerYear}-${String(i + 1).padStart(2, "0")}`;
                  const isSelected = key === month;
                  return (
                    <button key={key} onClick={() => { setMonth(key); setMonthPickerOpen(false); }} className="py-2 rounded-lg text-xs font-medium capitalize"
                      style={isSelected ? { background: "linear-gradient(135deg,#B8860B,#E8CD82,#B8860B)", color: "#1A1608" } : { background: BG, color: WHITE }}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {availableMonths.length > 1 && (
          <div className="flex items-center gap-2 mt-3 overflow-x-auto w-full">
            {availableMonths.map((m) => (
              <button key={m} onClick={() => setMonth(m)} className="px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 capitalize"
                style={month === m ? { background: "linear-gradient(135deg,#B8860B,#E8CD82,#B8860B)", color: "#1A1608" } : { background: SURFACE, color: MUTED, border: `1px solid ${BORDER}` }}>
                {monthLabel(m, lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-5 pt-4 overflow-x-auto">
        {[
          { key: "activos", label: t("tab_activos") },
          { key: "pagados", label: t("tab_pagados") },
          { key: "revision", label: `${t("tab_revision")}${counts.revision ? ` (${counts.revision})` : ""}` },
          { key: "eliminados", label: `${t("tab_eliminados")}${counts.eliminados ? ` (${counts.eliminados})` : ""}` },
        ].map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className="px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0"
            style={tab === tb.key ? { background: "linear-gradient(135deg,#B8860B,#E8CD82,#B8860B)", color: "#1A1608" } : { background: SURFACE, color: MUTED, border: `1px solid ${BORDER}` }}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab !== "revision" && tab !== "eliminados" && (
        <div className="px-5 mt-3">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search_placeholder")} className="bg-transparent outline-none flex-1 text-sm" style={{ color: WHITE }} />
          </div>
        </div>
      )}

      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "#2A1620", color: "#F19999" }}>{error}</div>}

      <div className="px-5 mt-4 flex flex-col gap-3">
        {deals === null && <div className="text-sm text-center py-10" style={{ color: MUTED }}>{t("loading")}</div>}
        {deals !== null && filtered.length === 0 && (
          <div className="text-sm text-center py-10" style={{ color: MUTED }}>
            {tab === "revision" && t("empty_revision")}
            {tab === "activos" && t("empty_activos")}
            {tab === "pagados" && t("empty_pagados")}
            {tab === "eliminados" && t("empty_eliminados")}
          </div>
        )}

        {filtered.map((deal) => {
          const waL = waLink(deal.telefono);

          if (deal.status === "revision") {
            const tz = TZ_INFO[deal.timezone || "china"];
            return (
              <div key={deal.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${GOLD_DIM}` }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="vaas-gold-text text-[10.5px] font-bold">{t("bot_closed")}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleTimezone(deal)} className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: BORDER, color: MUTED }}>
                      {tz.flag} {tz[lang]}
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-vaas" style={{ background: BORDER, color: MUTED }}>{shortDate(deal.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="vaas-gold-text font-mono-vaas text-lg font-bold">{money(deal.precio)}</span>
                  <span className="text-[13px]" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
                </div>
                <div className="font-mono-vaas text-xs mt-1" style={{ color: MUTED }}>{deal.telefono}</div>
                <div className="flex gap-2 mt-3.5">
                  <button onClick={() => approveDeal(deal)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ background: "#34D399", color: "#06110F" }}>
                    <Check size={16} /> {t("accept")}
                  </button>
                  <button onClick={() => sendToTrash(deal)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ background: "#2A1620", color: "#F19999" }}>
                    <Ban size={16} /> {t("reject")}
                  </button>
                </div>
              </div>
            );
          }

          if (deal.status === "eliminado") {
            const deletedAt = deal.deleted_at ? new Date(deal.deleted_at).getTime() : Date.now();
            const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - deletedAt) / 86400000));
            return (
              <div key={deal.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}`, opacity: 0.75 }}>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-[15px]" style={{ color: MUTED }}>{deal.marca || t("no_name_yet")}</span>
                  <span className="text-[10.5px]" style={{ color: "#E5484D" }}>{t("deletes_in")} {daysLeft}d</span>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono-vaas text-sm font-semibold" style={{ color: MUTED }}>{money(deal.precio)}</span>
                  <span className="text-xs" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => restoreDeal(deal)} className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-xs vaas-gold-bg" style={{ color: "#1A1608" }}>
                    <RotateCcw size={14} /> {t("restore")}
                  </button>
                  <button onClick={() => removeDealPermanent(deal.id)} className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-xs" style={{ background: "#2A1620", color: "#F19999" }}>
                    <XCircle size={14} /> {t("delete_now")}
                  </button>
                </div>
              </div>
            );
          }

          const idx = stageIndex(deal.status);
          const cat = deal.categoria ? catInfo(deal.categoria) : null;
          const stageColor = STAGE_COLORS[deal.status] || GOLD_DIM;
          const tz = TZ_INFO[deal.timezone || "china"];
          const urgentPayment = deal.status === "posteado";

          return (
            <div
              key={deal.id}
              className="rounded-xl p-4"
              style={
                urgentPayment
                  ? {
                      background: "linear-gradient(180deg, rgba(229,72,77,0.14) 0%, rgba(14,14,12,1) 55%)",
                      border: "1px solid #E5484D",
                      borderLeft: "3px solid #E5484D",
                      boxShadow: "0 0 18px rgba(229,72,77,0.25)",
                    }
                  : { background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${stageColor}` }
              }
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-base">{deal.marca || t("no_name_yet")}</span>
                    {cat && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: `${cat.color}22`, color: cat.color }}>{cat.label[lang]}</span>}
                    <button onClick={() => toggleTimezone(deal)} className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: BORDER, color: MUTED }}>
                      {tz.flag} {tz[lang]}
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-vaas" style={{ background: BORDER, color: MUTED }}>{shortDate(deal.created_at)}</span>
                  </div>
                  {deal.producto && <div className="text-xs mt-0.5" style={{ color: MUTED }}>🏷️ {deal.producto}</div>}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setNotesDealId(deal.id)} className="p-2 rounded-lg relative" style={{ background: `${GOLD}22` }}>
                    <BookOpen size={16} color={GOLD} />
                    {notesCount(deal) > 0 && <span className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ width: 16, height: 16, background: GOLD, color: "#1A1608" }}>{notesCount(deal)}</span>}
                  </button>
                  <button onClick={() => openEdit(deal)} className="p-2 rounded-lg" style={{ background: "#5BB8E822" }}><Pencil size={16} color="#5BB8E8" /></button>
                  <button onClick={() => sendToTrash(deal)} className="p-2 rounded-lg" style={{ background: "#E5484D22" }}><Trash2 size={16} color="#E5484D" /></button>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <span className="vaas-gold-text font-mono-vaas text-base font-semibold">{money(deal.precio)}</span>
                <span className="text-xs" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
                <div className="flex items-center gap-3 ml-auto">
                  {waL && <a href={waL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "#22D3C0" }}><MessageCircle size={13} /> WhatsApp</a>}
                  {deal.email && <a href={`mailto:${deal.email}`} className="flex items-center gap-1 text-xs" style={{ color: GOLD }}><Mail size={13} /> Email</a>}
                </div>
              </div>

              <div className="mt-3.5">
                <div className="flex items-center">
                  {STAGE_KEYS.map((s, i) => (
                    <div key={s} className="flex items-center flex-1">
                      <button onClick={() => jumpStage(deal, s)} className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: i <= idx ? STAGE_COLORS[s] : BORDER }} title={STAGE_LABELS[s][lang]} />
                      {i < STAGE_KEYS.length - 1 && <div className="flex-1 h-[2px]" style={{ background: i < idx ? STAGE_COLORS[STAGE_KEYS[i + 1]] : BORDER }} />}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10.5px] font-semibold" style={{ color: stageColor }}>{STAGE_LABELS[deal.status]?.[lang]}</span>
                  {idx < STAGE_KEYS.length - 1 && (
                    <button onClick={() => advanceStage(deal)} className="flex items-center gap-0.5 text-[11px] font-medium" style={{ color: GOLD }}>
                      {t("next")} <ChevronRight size={12} />
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
          <div className="w-full rounded-t-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-lg">{editingId ? t("edit_contract") : t("new_contract")}</span>
              <button onClick={() => setModalOpen(false)}><X size={20} color={MUTED} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label={t("brand_client")}><input value={draft.marca} onChange={(e) => setDraft({ ...draft, marca: e.target.value })} style={inputStyle} placeholder="Ej. SkinLab Co." /></Field>
              <Field label={t("product")}><input value={draft.producto} onChange={(e) => setDraft({ ...draft, producto: e.target.value })} style={inputStyle} placeholder="Ej. Azelaic Acid Ampoule" /></Field>
              <div className="flex gap-3">
                <Field label={t("price_usd")}><input type="number" value={draft.precio} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} style={inputStyle} placeholder="350" /></Field>
                <Field label={t("videos")}><input type="number" value={draft.videos} onChange={(e) => setDraft({ ...draft, videos: e.target.value })} style={inputStyle} placeholder="1" /></Field>
              </div>
              <Field label={t("whatsapp_field")}><input value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} style={inputStyle} placeholder="+1 555 123 4567" /></Field>
              <Field label={t("email_optional")}><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={inputStyle} placeholder="brand@empresa.com" /></Field>
              <Field label={t("category")}>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button key={c.key} onClick={() => setDraft({ ...draft, categoria: c.key })} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={draft.categoria === c.key ? { background: c.color, color: "#0B0E14" } : { background: BG, color: MUTED }}>
                      {c.label[lang]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("contact_timezone")}>
                <div className="flex gap-2">
                  {Object.entries(TZ_INFO).map(([key, info]) => (
                    <button key={key} onClick={() => setDraft({ ...draft, timezone: key })} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={(draft.timezone || "china") === key ? { background: "linear-gradient(135deg,#B8860B,#E8CD82,#B8860B)", color: "#1A1608" } : { background: BG, color: MUTED }}>
                      {info.flag} {info[lang]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <button onClick={saveDraft} className="w-full mt-5 py-3 rounded-xl font-semibold text-sm vaas-gold-bg" style={{ color: "#1A1608" }}>
              {editingId ? t("save_changes") : t("add_contract")}
            </button>
          </div>
        </div>
      )}

      {notesDeal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "#000000CC" }}>
          <div className="w-full rounded-t-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2"><BookOpen size={16} color={GOLD} /><span className="font-display font-bold text-base">{t("notes_title")}</span></div>
              <button onClick={() => setNotesDealId(null)}><X size={20} color={MUTED} /></button>
            </div>
            <div className="text-xs mb-4" style={{ color: MUTED }}>{notesDeal.marca || t("no_name_yet")}</div>

            <div className="flex items-center gap-1.5 mb-2"><FileText size={13} color={GOLD} /><span className="text-xs font-semibold">{t("scripts_title")}</span></div>
            <div className="flex flex-col gap-2 mb-2">
              {(notesDeal.notes?.scripts || []).map((s) => (
                <div key={s.id} className="rounded-lg p-2.5 flex items-start justify-between gap-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  <span className="text-xs whitespace-pre-wrap" style={{ lineHeight: 1.4 }}>{s.text}</span>
                  <button onClick={() => removeScript(s.id)} style={{ flexShrink: 0 }}><X size={13} color={MUTED} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-5">
              <textarea value={newScript} onChange={(e) => setNewScript(e.target.value)} placeholder={t("scripts_placeholder")} rows={2} style={{ ...inputStyle, flex: 1, resize: "vertical" }} />
              <button onClick={addScript} className="px-3 rounded-xl flex items-center justify-center vaas-gold-bg" style={{ flexShrink: 0 }}><Plus size={16} color="#1A1608" /></button>
            </div>

            <div className="flex items-center gap-1.5 mb-2"><Link2 size={13} color={GOLD} /><span className="text-xs font-semibold">{t("links_title")}</span></div>
            <div className="flex flex-col gap-2 mb-2">
              {(notesDeal.notes?.links || []).map((l) => (
                <div key={l.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-xs break-all" style={{ color: "#5BB8E8" }}>{l.url}</a>
                  <button onClick={() => removeLink(l.id)} style={{ flexShrink: 0 }}><X size={13} color={MUTED} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-5">
              <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="https://tiktok.com/..." style={inputStyle} />
              <button onClick={addLink} className="px-3 rounded-xl flex items-center justify-center vaas-gold-bg" style={{ flexShrink: 0 }}><Plus size={16} color="#1A1608" /></button>
            </div>

            <div className="flex items-center gap-1.5 mb-2"><BookOpen size={13} color={GOLD} /><span className="text-xs font-semibold">{t("notes_title")}</span></div>
            <textarea value={notesDeal.notes?.notas || ""} onChange={(e) => updateNotes(notesDeal.id, { notas: e.target.value })} placeholder={t("notes_placeholder")} rows={4} style={{ ...inputStyle, width: "100%", resize: "vertical" }} />
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
