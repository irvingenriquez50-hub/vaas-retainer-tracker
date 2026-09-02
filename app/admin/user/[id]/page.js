"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  ArrowLeft, Eye, Pencil, MessageCircle, Mail, ChevronRight, ChevronLeft, Trash2,
  BookOpen, Link2, FileText, Lock, Unlock, X, Plus, Minus,
  Calendar, Check, Ban, RotateCcw, XCircle, Languages,
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
  empty_activos: { es: "Sin contratos activos este mes.", en: "No active contracts this month." },
  empty_pagados: { es: "Ningún contrato pagado este mes.", en: "No paid contracts this month." },
  empty_eliminados: { es: "Nada eliminado este mes.", en: "Nothing deleted this month." },
  empty_filter: { es: "No hay contratos en este filtro.", en: "No contracts in this filter." },
  filter_all: { es: "Todos", en: "All" },
  bot_closed: { es: "CERRADO POR EL BOT — REVISAR", en: "CLOSED BY THE BOT — REVIEW" },
  accept: { es: "Aceptar", en: "Accept" },
  reject: { es: "Rechazar", en: "Reject" },
  no_name_yet: { es: "Sin nombre todavía", en: "No name yet" },
  deletes_in: { es: "se borra en", en: "deletes in" },
  restore: { es: "Restaurar", en: "Restore" },
  delete_now: { es: "Eliminar ya", en: "Delete now" },
  next: { es: "Siguiente", en: "Next" },
  edit_contract: { es: "Editar contrato", en: "Edit contract" },
  view_contract: { es: "Ver contrato", en: "View contract" },
  brand_client: { es: "Marca / cliente", en: "Brand / client" },
  product: { es: "Producto", en: "Product" },
  price_usd: { es: "Precio (USD)", en: "Price (USD)" },
  videos: { es: "Videos", en: "Videos" },
  whatsapp_field: { es: "WhatsApp", en: "WhatsApp" },
  email_field: { es: "Email", en: "Email" },
  category: { es: "Categoría", en: "Category" },
  save_changes: { es: "Guardar cambios", en: "Save changes" },
  close: { es: "Cerrar", en: "Close" },
  notes_title: { es: "Notas", en: "Notes" },
  scripts_title: { es: "Escritos", en: "Scripts" },
  scripts_placeholder: { es: "Pega el escrito...", en: "Paste the script..." },
  links_title: { es: "Links de referencia", en: "Reference links" },
  notes_placeholder: { es: "Notas libres...", en: "Free notes..." },
  no_scripts: { es: "Sin escritos guardados.", en: "No scripts saved." },
  no_links: { es: "Sin links guardados.", en: "No links saved." },
  no_notes: { es: "Sin notas.", en: "No notes." },
  collab_one: { es: "colaboración", en: "collaboration" },
  collab_many: { es: "colaboraciones", en: "collaborations" },
  video_one: { es: "video", en: "video" },
  video_many: { es: "videos", en: "videos" },
  // propias del panel de admin
  view_mode: { es: "Ver", en: "View" },
  edit_mode: { es: "Editar", en: "Edit" },
  edit_mode_banner: { es: "Modo edición activo — los cambios afectan la cuenta de", en: "Edit mode on — changes affect the account of" },
  this_person: { es: "esta persona", en: "this person" },
  read_only_banner: { es: "Modo de solo lectura — puedes ver todo, pero nada se puede cambiar", en: "Read-only mode — you can see everything, but nothing can be changed" },
  read_only: { es: "Solo lectura", en: "Read only" },
  load_error: { es: "No se pudieron cargar los contratos de este usuario.", en: "Couldn't load this user's contracts." },
};

// "pendiente" va PRIMERO: es cuando la marca dijo que iba a confirmar los rates
// con su jefe y todavía no hay nada acordado. Antes esos contactos se perdían
// porque no tenían dónde vivir en el tablero.
const STAGE_KEYS = ["pendiente", "no_solicitado", "solicitado", "llego", "en_progreso", "posteado", "pagado"];
const STAGE_COLORS = { pendiente: "#9CA6B4", no_solicitado: "#E5484D", solicitado: "#F2994A", llego: "#F2C94C", en_progreso: "#C9D96B", posteado: "#8FD98F", pagado: "#34D399" };
const STAGE_LABELS = {
  pendiente: { es: "Pendiente de confirmar", en: "Pending confirmation" },
  no_solicitado: { es: "No solicitado", en: "Sample not requested" },
  solicitado: { es: "Solicitado", en: "Sample requested" },
  llego: { es: "Llegó", en: "Arrived" },
  en_progreso: { es: "En progreso", en: "In progress" },
  posteado: { es: "Publicado — pago pendiente", en: "Posted — payment pending" },
  pagado: { es: "Pagado", en: "Paid" },
};
const stageIndex = (key) => STAGE_KEYS.indexOf(key);

// Filtros de etapa dentro de "Activos" — los mismos que en el dashboard.
// "pagado" no va porque esos viven en su propia pestaña.
const FILTER_STAGE_KEYS = ["pendiente", "no_solicitado", "solicitado", "llego", "en_progreso", "posteado"];
const STAGE_SHORT = {
  pendiente: { es: "Pendiente", en: "Pending" },
  no_solicitado: { es: "No solicitado", en: "Not requested" },
  solicitado: { es: "Solicitado", en: "Requested" },
  llego: { es: "Llegó", en: "Arrived" },
  en_progreso: { es: "En progreso", en: "In progress" },
  posteado: { es: "Publicado, no pagado", en: "Posted, unpaid" },
};

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

export default function AdminUserDetail() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const userId = params.id;

  const [lang, setLang] = useState("es");
  const t = (key) => STRINGS[key]?.[lang] || key;

  const [targetProfile, setTargetProfile] = useState(null);
  const [deals, setDeals] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState("activos");
  const [stageFilter, setStageFilter] = useState("todos");
  const [month, setMonth] = useState(monthKey());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [detailDeal, setDetailDeal] = useState(null); // pencil modal
  const [draft, setDraft] = useState(null);
  const [notesDeal, setNotesDeal] = useState(null); // book modal
  const [newScript, setNewScript] = useState("");
  const [newLink, setNewLink] = useState("");

  // Mismo arreglo que en el dashboard del miembro: las notas se escriben contra
  // un estado local y se guardan cuando dejas de teclear. Antes cada letra iba
  // al servidor y React se comía caracteres al escribir rápido.
  const [notasDraft, setNotasDraft] = useState("");
  const [notasEstado, setNotasEstado] = useState("");
  const notasSavedRef = useRef("");

  useEffect(() => {
    const savedLang = typeof window !== "undefined" ? localStorage.getItem("vaas-lang") : null;
    if (savedLang) setLang(savedLang);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: myProf } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!myProf?.is_admin) return router.replace("/dashboard");

      const { data: tProf } = await supabase.from("profiles").select("*").eq("id", userId).single();
      setTargetProfile(tProf);
      loadDeals();
    })();
    // Ojo: aquí NUNCA se corre el autoborrado de la papelera a los 30 días que sí
    // tiene el dashboard. Entrar a ver la cuenta de alguien no debe borrarle nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadDeals = async () => {
    const { data, error } = await supabase.from("deals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) setError(STRINGS.load_error.es);
    else setDeals(data || []);
  };

  const switchLang = (l) => {
    setLang(l);
    if (typeof window !== "undefined") localStorage.setItem("vaas-lang", l);
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
    const eliminados = monthDeals.filter((d) => d.status === "eliminado").length;
    return { revision, pendiente, pagado, eliminados, pendienteColabs: pendienteDeals.length, pagadoColabs: pagadoDeals.length, pendienteVideos, pagadoVideos };
  }, [monthDeals]);

  const stageCounts = useMemo(() => {
    const activos = monthDeals.filter((d) => !["pagado", "revision", "eliminado"].includes(d.status));
    const result = { todos: activos.length };
    for (const d of activos) result[d.status] = (result[d.status] || 0) + 1;
    return result;
  }, [monthDeals]);

  useEffect(() => {
    if (stageFilter !== "todos" && (stageCounts[stageFilter] || 0) === 0) setStageFilter("todos");
  }, [stageCounts, stageFilter]);

  const filtered = useMemo(() => {
    const base = monthDeals.filter((d) => {
      if (tab === "revision") return d.status === "revision";
      if (tab === "activos") {
        if (["pagado", "revision", "eliminado"].includes(d.status)) return false;
        return stageFilter === "todos" || d.status === stageFilter;
      }
      if (tab === "eliminados") return d.status === "eliminado";
      return d.status === "pagado";
    });
    const q = query.trim().toLowerCase();
    const searched = q ? base.filter((d) => `${d.marca} ${d.producto}`.toLowerCase().includes(q)) : base;
    return [...searched].sort((a, b) => new Date(a.deleted_at || a.created_at) - new Date(b.deleted_at || b.created_at));
  }, [monthDeals, tab, query, stageFilter]);

  // ─── Acciones. TODAS revisan editMode primero: en modo Ver nada se puede tocar ───
  const advanceStage = async (deal) => {
    if (!editMode) return;
    const idx = stageIndex(deal.status);
    if (idx === -1 || idx >= STAGE_KEYS.length - 1) return;
    await supabase.from("deals").update({ status: STAGE_KEYS[idx + 1] }).eq("id", deal.id);
    loadDeals();
  };
  const jumpStage = async (deal, key) => {
    if (!editMode) return;
    await supabase.from("deals").update({ status: key }).eq("id", deal.id);
    loadDeals();
  };
  const toggleTimezone = async (deal) => {
    if (!editMode) return;
    await supabase.from("deals").update({ timezone: deal.timezone === "us" ? "china" : "us" }).eq("id", deal.id);
    loadDeals();
  };
  const updateVideosEntregados = async (deal, delta) => {
    if (!editMode) return;
    const current = deal.videos_entregados || 0;
    const next = Math.max(0, Math.min(Number(deal.videos || 0), current + delta));
    if (next === current) return;
    await supabase.from("deals").update({ videos_entregados: next }).eq("id", deal.id);
    loadDeals();
  };
  const approveDeal = async (deal) => {
    if (!editMode) return;
    await supabase.from("deals").update({ status: "no_solicitado" }).eq("id", deal.id);
    loadDeals();
  };
  // El botecito rojo manda a la papelera (recuperable 30 días), NO borra de verdad
  // — igual que en el dashboard. El borrado permanente vive en la pestaña Eliminados.
  const sendToTrash = async (deal) => {
    if (!editMode) return;
    await supabase.from("deals").update({ status: "eliminado", deleted_at: new Date().toISOString() }).eq("id", deal.id);
    loadDeals();
  };
  const restoreDeal = async (deal) => {
    if (!editMode) return;
    await supabase.from("deals").update({ status: "no_solicitado", deleted_at: null }).eq("id", deal.id);
    loadDeals();
  };
  const removeDealPermanent = async (deal) => {
    if (!editMode) return;
    if (!confirm(`¿Borrar "${deal.marca || "este contrato"}" de forma permanente? Esto no se puede deshacer.`)) return;
    await supabase.from("deals").delete().eq("id", deal.id);
    loadDeals();
  };

  // ---- pencil: view/edit full deal details ----
  const openDetail = (deal) => {
    setDraft({ ...deal, precio: String(deal.precio), videos: String(deal.videos), email: deal.email || "" });
    setDetailDeal(deal);
  };
  const saveDetail = async () => {
    if (!editMode || !draft) return;
    await supabase.from("deals").update({
      marca: draft.marca, producto: draft.producto || "", categoria: draft.categoria || null,
      precio: Number(draft.precio), videos: Number(draft.videos), telefono: draft.telefono || "",
      email: draft.email || "", timezone: draft.timezone || "china", updated_at: new Date().toISOString(),
    }).eq("id", detailDeal.id);
    setDetailDeal(null);
    loadDeals();
  };

  // ---- notes ----
  const updateNotes = async (dealId, patch) => {
    if (!editMode) return;
    const current = (deals || []).find((d) => d.id === dealId);
    const nextNotes = { scripts: [], links: [], notas: "", ...(current?.notes || {}), ...patch };
    await supabase.from("deals").update({ notes: nextNotes }).eq("id", dealId);
    loadDeals();
    setNotesDeal((prev) => prev ? { ...prev, notes: nextNotes } : prev);
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

  // Al abrir las notas de un contrato, se carga lo que ya tenía guardado.
  useEffect(() => {
    const texto = notesDeal?.notes?.notas || "";
    setNotasDraft(texto);
    notasSavedRef.current = texto;
    setNotasEstado("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDeal?.id]);

  // Se guarda solo, un segundo después de que dejas de escribir. En modo Ver no
  // se guarda nada: updateNotes tiene su propio candado de editMode.
  useEffect(() => {
    if (!notesDeal?.id || !editMode) return;
    if (notasDraft === notasSavedRef.current) return;
    setNotasEstado("escribiendo");
    const id = notesDeal.id;
    const t = setTimeout(async () => {
      const texto = notasDraft;
      await updateNotes(id, { notas: texto });
      notasSavedRef.current = texto;
      setNotasEstado("guardado");
      setTimeout(() => setNotasEstado((e) => (e === "guardado" ? "" : e)), 2000);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notasDraft, notesDeal?.id, editMode]);

  /** Cierra las notas guardando lo que falte, por si cerraste antes del segundo
   * del guardado automático. */
  const closeNotes = () => {
    const id = notesDeal?.id;
    const texto = notasDraft;
    if (id && editMode && texto !== notasSavedRef.current) {
      notasSavedRef.current = texto;
      updateNotes(id, { notas: texto });
    }
    setNotesDeal(null);
  };

  const waLink = (phone) => {
    const digits = (phone || "").replace(/[^0-9]/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", GOLD_DIM = "#6B5A2A", WHITE = "#F5F3EC", MUTED = "#8C8574";
  const inputStyle = (locked) => ({ background: locked ? "#161512" : BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, color: locked ? MUTED : WHITE, width: "100%", outline: "none" });

  return (
    <div className="min-h-screen pb-16" style={{ background: BG, color: WHITE }}>
      <div className="px-5 pt-6 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.push("/admin")} className="p-2 rounded-lg" style={{ background: SURFACE }}>
            <ArrowLeft size={16} color={MUTED} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg truncate">{targetProfile?.full_name || targetProfile?.email || "..."}</div>
            <div className="text-xs truncate" style={{ color: MUTED }}>{targetProfile?.email}</div>
          </div>
          <button onClick={() => switchLang(lang === "es" ? "en" : "es")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0" style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: GOLD }}>
            <Languages size={13} /> {lang === "es" ? "EN" : "ES"}
          </button>
        </div>

        <div className="flex gap-2 rounded-xl p-1" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <button onClick={() => setEditMode(false)} className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold" style={!editMode ? { background: GOLD, color: "#1A1608" } : { color: MUTED }}>
            <Eye size={14} /> {t("view_mode")}
          </button>
          <button onClick={() => setEditMode(true)} className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold" style={editMode ? { background: "#E5484D", color: "#fff" } : { color: MUTED }}>
            <Pencil size={14} /> {t("edit_mode")}
          </button>
        </div>
        {editMode ? (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: "#F2994A" }}>
            <Unlock size={12} /> {t("edit_mode_banner")} {targetProfile?.full_name || t("this_person")}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: MUTED }}>
            <Lock size={12} /> {t("read_only_banner")}
          </div>
        )}

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

      {tab === "activos" && (
        <div className="px-5 mt-3 flex gap-1.5 flex-wrap">
          {[
            { key: "todos", label: t("filter_all"), color: GOLD },
            ...FILTER_STAGE_KEYS.map((k) => ({ key: k, label: STAGE_SHORT[k][lang], color: STAGE_COLORS[k] })),
          ].map((f) => {
            const count = stageCounts[f.key] || 0;
            const active = stageFilter === f.key;
            const empty = count === 0 && f.key !== "todos";
            return (
              <button
                key={f.key}
                onClick={() => setStageFilter(f.key)}
                disabled={empty}
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full text-[11px] font-semibold"
                style={
                  active
                    ? { background: f.color, color: "#0B0E14", border: `1px solid ${f.color}` }
                    : { background: SURFACE, color: f.color, border: `1px solid ${f.color}38`, opacity: empty ? 0.35 : 1 }
                }
              >
                {f.label}
                <span
                  className="px-1.5 rounded-full text-[10px] font-bold"
                  style={active ? { background: "#0B0E1426", color: "#0B0E14" } : { background: `${f.color}1F`, color: f.color }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
            {tab === "activos" && (stageFilter === "todos" ? t("empty_activos") : t("empty_filter"))}
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
                    <button onClick={() => toggleTimezone(deal)} disabled={!editMode} className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: BORDER, color: MUTED, cursor: editMode ? "pointer" : "default" }}>
                      {tz.flag} {tz[lang]}
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-vaas" style={{ background: BORDER, color: MUTED }}>{shortDate(deal.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="vaas-gold-text font-mono-vaas text-lg font-bold">{money(deal.precio)}</span>
                  <span className="text-[13px]" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
                </div>
                {/* Mismo enlace de WhatsApp que en el dashboard del miembro. */}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="font-mono-vaas text-xs" style={{ color: MUTED }}>{deal.telefono}</span>
                  {waL && (
                    <a href={waL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "#22D3C0" }}>
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  {deal.email && (
                    <a href={`mailto:${deal.email}`} className="flex items-center gap-1 text-xs" style={{ color: GOLD }}>
                      <Mail size={13} /> Email
                    </a>
                  )}
                </div>
                {editMode ? (
                  <div className="flex gap-2 mt-3.5">
                    <button onClick={() => approveDeal(deal)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ background: "#34D399", color: "#06110F" }}>
                      <Check size={16} /> {t("accept")}
                    </button>
                    <button onClick={() => sendToTrash(deal)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ background: "#2A1620", color: "#F19999" }}>
                      <Ban size={16} /> {t("reject")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: MUTED }}><Lock size={12} /> {t("read_only")}</div>
                )}
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
                {editMode ? (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => restoreDeal(deal)} className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-xs vaas-gold-bg" style={{ color: "#1A1608" }}>
                      <RotateCcw size={14} /> {t("restore")}
                    </button>
                    <button onClick={() => removeDealPermanent(deal)} className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-xs" style={{ background: "#2A1620", color: "#F19999" }}>
                      <XCircle size={14} /> {t("delete_now")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: MUTED }}><Lock size={12} /> {t("read_only")}</div>
                )}
              </div>
            );
          }

          const idx = stageIndex(deal.status);
          const cat = deal.categoria ? catInfo(deal.categoria) : null;
          const stageColor = STAGE_COLORS[deal.status] || GOLD_DIM;
          const tz = TZ_INFO[deal.timezone || "china"];
          const urgentPayment = deal.status === "posteado";
          const entregados = deal.videos_entregados || 0;

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
                    <button onClick={() => toggleTimezone(deal)} disabled={!editMode} className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: BORDER, color: MUTED, cursor: editMode ? "pointer" : "default" }}>
                      {tz.flag} {tz[lang]}
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-vaas" style={{ background: BORDER, color: MUTED }}>{shortDate(deal.created_at)}</span>
                  </div>
                  {deal.producto && <div className="text-xs mt-0.5" style={{ color: MUTED }}>🏷️ {deal.producto}</div>}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setNotesDeal(deal)} className="p-2 rounded-lg relative" style={{ background: `${GOLD}22` }}>
                    <BookOpen size={16} color={GOLD} />
                    {notesCount(deal) > 0 && <span className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ width: 16, height: 16, background: GOLD, color: "#1A1608" }}>{notesCount(deal)}</span>}
                  </button>
                  <button onClick={() => openDetail(deal)} className="p-2 rounded-lg" style={{ background: "#5BB8E822" }}>
                    <Pencil size={16} color="#5BB8E8" />
                  </button>
                  {editMode && (
                    <button onClick={() => sendToTrash(deal)} className="p-2 rounded-lg" style={{ background: "#E5484D22" }}>
                      <Trash2 size={16} color="#E5484D" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <span className="vaas-gold-text font-mono-vaas text-base font-semibold">{money(deal.precio)}</span>

                <div className="flex items-center gap-1.5" style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "3px 6px" }}>
                  <span className="text-xs">🎥</span>
                  {editMode && (
                    <button
                      onClick={() => updateVideosEntregados(deal, -1)}
                      disabled={entregados <= 0}
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: BORDER, opacity: entregados <= 0 ? 0.4 : 1 }}
                    >
                      <Minus size={11} color={MUTED} />
                    </button>
                  )}
                  <span className="text-xs font-mono-vaas font-semibold" style={{ color: WHITE, minWidth: 44, textAlign: "center" }}>
                    {entregados}/{deal.videos} videos
                  </span>
                  {editMode && (
                    <button
                      onClick={() => updateVideosEntregados(deal, 1)}
                      disabled={entregados >= Number(deal.videos || 0)}
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: BORDER, opacity: entregados >= Number(deal.videos || 0) ? 0.4 : 1 }}
                    >
                      <Plus size={11} color={MUTED} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  {waL && <a href={waL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "#22D3C0" }}><MessageCircle size={13} /> WhatsApp</a>}
                  {deal.email && <a href={`mailto:${deal.email}`} className="flex items-center gap-1 text-xs" style={{ color: GOLD }}><Mail size={13} /> Email</a>}
                </div>
              </div>

              {idx > -1 && (
                <div className="mt-3.5">
                  <div className="flex items-center">
                    {STAGE_KEYS.map((s, i) => (
                      <div key={s} className="flex items-center flex-1">
                        <button onClick={() => jumpStage(deal, s)} disabled={!editMode} className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: i <= idx ? STAGE_COLORS[s] : BORDER, cursor: editMode ? "pointer" : "default" }} title={STAGE_LABELS[s][lang]} />
                        {i < STAGE_KEYS.length - 1 && <div className="flex-1 h-[2px]" style={{ background: i < idx ? STAGE_COLORS[STAGE_KEYS[i + 1]] : BORDER }} />}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10.5px] font-semibold" style={{ color: stageColor }}>{STAGE_LABELS[deal.status]?.[lang]}</span>
                    {editMode && idx < STAGE_KEYS.length - 1 && (
                      <button onClick={() => advanceStage(deal)} className="flex items-center gap-0.5 text-[11px] font-medium" style={{ color: GOLD }}>
                        {t("next")} <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* pencil modal: full deal detail, view or edit */}
      {detailDeal && draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "#000000CC" }}>
          <div className="w-full rounded-t-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-lg">{editMode ? t("edit_contract") : t("view_contract")}</span>
              <button onClick={() => setDetailDeal(null)}><X size={20} color={MUTED} /></button>
            </div>
            {!editMode && <div className="flex items-center gap-1.5 mb-4 text-[11px]" style={{ color: MUTED }}><Lock size={12} /> {t("read_only")}</div>}
            {editMode && <div className="mb-4" />}

            <div className="flex flex-col gap-3">
              <Field label={t("brand_client")} muted={MUTED}>
                <input value={draft.marca} disabled={!editMode} onChange={(e) => setDraft({ ...draft, marca: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <Field label={t("product")} muted={MUTED}>
                <input value={draft.producto} disabled={!editMode} onChange={(e) => setDraft({ ...draft, producto: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <div className="flex gap-3">
                <Field label={t("price_usd")} muted={MUTED}>
                  <input type="number" value={draft.precio} disabled={!editMode} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} style={inputStyle(!editMode)} />
                </Field>
                <Field label={t("videos")} muted={MUTED}>
                  <input type="number" value={draft.videos} disabled={!editMode} onChange={(e) => setDraft({ ...draft, videos: e.target.value })} style={inputStyle(!editMode)} />
                </Field>
              </div>
              <Field label={t("whatsapp_field")} muted={MUTED}>
                <input value={draft.telefono} disabled={!editMode} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <Field label={t("email_field")} muted={MUTED}>
                <input value={draft.email} disabled={!editMode} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <Field label={t("category")} muted={MUTED}>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button key={c.key} disabled={!editMode} onClick={() => editMode && setDraft({ ...draft, categoria: c.key })} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={draft.categoria === c.key ? { background: c.color, color: "#0B0E14" } : { background: BG, color: MUTED }}>
                      {c.label[lang]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {editMode ? (
              <button onClick={saveDetail} className="w-full mt-5 py-3 rounded-xl font-semibold text-sm" style={{ background: GOLD, color: "#1A1608" }}>
                {t("save_changes")}
              </button>
            ) : (
              <button onClick={() => setDetailDeal(null)} className="w-full mt-5 py-3 rounded-xl font-semibold text-sm" style={{ background: BORDER, color: MUTED }}>
                {t("close")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* book modal: notes, view or edit */}
      {notesDeal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "#000000CC" }}>
          <div className="w-full rounded-t-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2"><BookOpen size={16} color={GOLD} /><span className="font-display font-bold text-base">{t("notes_title")}</span></div>
              <button onClick={closeNotes}><X size={20} color={MUTED} /></button>
            </div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>{notesDeal.marca || t("no_name_yet")}</div>
            {!editMode && <div className="flex items-center gap-1.5 mb-4 text-[11px]" style={{ color: MUTED }}><Lock size={12} /> {t("read_only")}</div>}
            {editMode && <div className="mb-4" />}

            <div className="flex items-center gap-1.5 mb-2"><FileText size={13} color={GOLD} /><span className="text-xs font-semibold">{t("scripts_title")}</span></div>
            <div className="flex flex-col gap-2 mb-2">
              {(notesDeal.notes?.scripts || []).map((s) => (
                <div key={s.id} className="rounded-lg p-2.5 flex items-start justify-between gap-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  <span className="text-xs whitespace-pre-wrap" style={{ lineHeight: 1.4 }}>{s.text}</span>
                  {editMode && <button onClick={() => removeScript(s.id)} style={{ flexShrink: 0 }}><X size={13} color={MUTED} /></button>}
                </div>
              ))}
              {(notesDeal.notes?.scripts || []).length === 0 && <div className="text-xs" style={{ color: MUTED }}>{t("no_scripts")}</div>}
            </div>
            {editMode && (
              <div className="flex gap-2 mb-5">
                <textarea value={newScript} onChange={(e) => setNewScript(e.target.value)} placeholder={t("scripts_placeholder")} rows={2} style={{ ...inputStyle(false), flex: 1, resize: "vertical" }} />
                <button onClick={addScript} className="px-3 rounded-xl flex items-center justify-center" style={{ background: GOLD, flexShrink: 0 }}><Plus size={16} color="#1A1608" /></button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-2 mt-4"><Link2 size={13} color={GOLD} /><span className="text-xs font-semibold">{t("links_title")}</span></div>
            <div className="flex flex-col gap-2 mb-2">
              {(notesDeal.notes?.links || []).map((l) => (
                <div key={l.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-xs break-all" style={{ color: "#5BB8E8" }}>{l.url}</a>
                  {editMode && <button onClick={() => removeLink(l.id)} style={{ flexShrink: 0 }}><X size={13} color={MUTED} /></button>}
                </div>
              ))}
              {(notesDeal.notes?.links || []).length === 0 && <div className="text-xs" style={{ color: MUTED }}>{t("no_links")}</div>}
            </div>
            {editMode && (
              <div className="flex gap-2 mb-5">
                <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="https://tiktok.com/..." style={inputStyle(false)} />
                <button onClick={addLink} className="px-3 rounded-xl flex items-center justify-center" style={{ background: GOLD, flexShrink: 0 }}><Plus size={16} color="#1A1608" /></button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-2 mt-4"><BookOpen size={13} color={GOLD} /><span className="text-xs font-semibold">{t("notes_title")}</span></div>
            {editMode ? (
              <>
                <textarea value={notasDraft} onChange={(e) => setNotasDraft(e.target.value)} placeholder={t("notes_placeholder")} rows={4} style={{ ...inputStyle(false), width: "100%", resize: "vertical" }} />
                <div className="text-[10.5px] mt-1 h-4" style={{ color: notasEstado === "guardado" ? "#34D399" : MUTED }}>
                  {notasEstado === "escribiendo" ? "Escribiendo..." : notasEstado === "guardado" ? "Guardado ✓" : ""}
                </div>
              </>
            ) : (
              <div className="text-xs p-2.5 rounded-lg" style={{ background: BG, border: `1px solid ${BORDER}`, color: notesDeal.notes?.notas ? WHITE : MUTED, minHeight: 60 }}>
                {notesDeal.notes?.notas || t("no_notes")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, muted }) {
  return (
    <div className="flex-1">
      <div className="text-[11.5px] mb-1.5" style={{ color: muted }}>{label}</div>
      {children}
    </div>
  );
}
