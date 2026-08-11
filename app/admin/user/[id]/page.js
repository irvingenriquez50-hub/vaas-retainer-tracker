"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  ArrowLeft, Eye, Pencil, MessageCircle, Mail, ChevronRight, Trash2,
  BookOpen, Link2, FileText, Lock, Unlock, X, Plus,
} from "lucide-react";

const STAGE_KEYS = ["no_solicitado", "solicitado", "llego", "en_progreso", "posteado", "pagado"];
const STAGE_COLORS = { no_solicitado: "#E5484D", solicitado: "#F2994A", llego: "#F2C94C", en_progreso: "#C9D96B", posteado: "#8FD98F", pagado: "#34D399" };
const STAGE_LABELS = {
  no_solicitado: "Muestra no solicitada", solicitado: "Muestra solicitada", llego: "Llegó",
  en_progreso: "En progreso", posteado: "Publicado — pago pendiente", pagado: "Pagado",
};
const stageIndex = (key) => STAGE_KEYS.indexOf(key);
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n || 0);
const TZ_FLAG = { china: "🇨🇳 China", us: "🇺🇸 US" };
const CATEGORIES = [
  { key: "beauty", label: "Beauty", color: "#E879A6" },
  { key: "health", label: "Health/Suplementos", color: "#D9B85C" },
  { key: "electronics", label: "Electronics", color: "#5BB8E8" },
  { key: "otro", label: "Otro", color: "#9CA6B4" },
];
const catInfo = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[3];

export default function AdminUserDetail() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const userId = params.id;

  const [targetProfile, setTargetProfile] = useState(null);
  const [deals, setDeals] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState("activos");
  const [error, setError] = useState("");
  const [detailDeal, setDetailDeal] = useState(null); // pencil modal
  const [draft, setDraft] = useState(null);
  const [notesDeal, setNotesDeal] = useState(null); // book modal
  const [newScript, setNewScript] = useState("");
  const [newLink, setNewLink] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: myProf } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!myProf?.is_admin) return router.replace("/dashboard");

      const { data: tProf } = await supabase.from("profiles").select("*").eq("id", userId).single();
      setTargetProfile(tProf);
      loadDeals();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadDeals = async () => {
    const { data, error } = await supabase.from("deals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) setError("No se pudieron cargar los contratos de este usuario.");
    else setDeals(data || []);
  };

  const filtered = useMemo(() => {
    const list = deals || [];
    if (tab === "activos") return list.filter((d) => !["pagado", "revision", "eliminado"].includes(d.status));
    if (tab === "pagados") return list.filter((d) => d.status === "pagado");
    if (tab === "revision") return list.filter((d) => d.status === "revision");
    return list.filter((d) => d.status === "eliminado");
  }, [deals, tab]);

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
  const deleteDeal = async (deal) => {
    if (!editMode) return;
    if (!confirm("¿Borrar este contrato de forma permanente?")) return;
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

  const waLink = (phone) => {
    const digits = (phone || "").replace(/[^0-9]/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", WHITE = "#F5F3EC", MUTED = "#8C8574";
  const inputStyle = (locked) => ({ background: locked ? "#161512" : BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, color: locked ? MUTED : WHITE, width: "100%", outline: "none" });

  return (
    <div className="min-h-screen pb-16" style={{ background: BG, color: WHITE }}>
      <div className="px-5 pt-6 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.push("/admin")} className="p-2 rounded-lg" style={{ background: SURFACE }}>
            <ArrowLeft size={16} color={MUTED} />
          </button>
          <div>
            <div className="font-display font-bold text-lg">{targetProfile?.full_name || targetProfile?.email || "..."}</div>
            <div className="text-xs" style={{ color: MUTED }}>{targetProfile?.email}</div>
          </div>
        </div>

        <div className="flex gap-2 rounded-xl p-1" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <button onClick={() => setEditMode(false)} className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold" style={!editMode ? { background: GOLD, color: "#1A1608" } : { color: MUTED }}>
            <Eye size={14} /> Ver
          </button>
          <button onClick={() => setEditMode(true)} className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold" style={editMode ? { background: "#E5484D", color: "#fff" } : { color: MUTED }}>
            <Pencil size={14} /> Editar
          </button>
        </div>
        {editMode ? (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: "#F2994A" }}>
            <Unlock size={12} /> Modo edición activo — los cambios afectan la cuenta de {targetProfile?.full_name || "esta persona"}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: MUTED }}>
            <Lock size={12} /> Modo de solo lectura — puedes ver todo, pero nada se puede cambiar
          </div>
        )}
      </div>

      <div className="flex gap-2 px-5 pt-4 overflow-x-auto">
        {[
          { key: "revision", label: "Por revisar" },
          { key: "activos", label: "Activos" },
          { key: "pagados", label: "Pagados" },
          { key: "eliminados", label: "Eliminados" },
        ].map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className="px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0"
            style={tab === tb.key ? { background: GOLD, color: "#1A1608" } : { background: SURFACE, color: MUTED, border: `1px solid ${BORDER}` }}>
            {tb.label}
          </button>
        ))}
      </div>

      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "#2A1620", color: "#F19999" }}>{error}</div>}

      <div className="px-5 mt-4 flex flex-col gap-3">
        {deals === null && <div className="text-sm text-center py-10" style={{ color: MUTED }}>Cargando...</div>}
        {deals !== null && filtered.length === 0 && <div className="text-sm text-center py-10" style={{ color: MUTED }}>Nada aquí.</div>}

        {filtered.map((deal) => {
          const waL = waLink(deal.telefono);
          const idx = stageIndex(deal.status);
          const stageColor = STAGE_COLORS[deal.status] || GOLD;

          return (
            <div key={deal.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${stageColor}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display font-bold text-base">{deal.marca || "Sin nombre"}</div>
                  {deal.producto && <div className="text-xs mt-0.5" style={{ color: MUTED }}>🏷️ {deal.producto}</div>}
                  {deal.timezone && <div className="text-[10px] mt-1" style={{ color: MUTED }}>{TZ_FLAG[deal.timezone] || deal.timezone}</div>}
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
                    <button onClick={() => deleteDeal(deal)} className="p-2 rounded-lg" style={{ background: "#E5484D22" }}>
                      <Trash2 size={16} color="#E5484D" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <span className="font-mono-vaas text-base font-semibold" style={{ color: GOLD }}>{money(deal.precio)}</span>
                <span className="text-xs" style={{ color: MUTED }}>🎥 {deal.videos} videos</span>
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
                        <button onClick={() => jumpStage(deal, s)} disabled={!editMode} className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: i <= idx ? STAGE_COLORS[s] : BORDER, cursor: editMode ? "pointer" : "default" }} title={STAGE_LABELS[s]} />
                        {i < STAGE_KEYS.length - 1 && <div className="flex-1 h-[2px]" style={{ background: i < idx ? STAGE_COLORS[STAGE_KEYS[i + 1]] : BORDER }} />}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10.5px] font-semibold" style={{ color: stageColor }}>{STAGE_LABELS[deal.status]}</span>
                    {editMode && idx < STAGE_KEYS.length - 1 && (
                      <button onClick={() => advanceStage(deal)} className="flex items-center gap-0.5 text-[11px] font-medium" style={{ color: GOLD }}>
                        Siguiente <ChevronRight size={12} />
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
              <span className="font-display font-bold text-lg">{editMode ? "Editar contrato" : "Ver contrato"}</span>
              <button onClick={() => setDetailDeal(null)}><X size={20} color={MUTED} /></button>
            </div>
            {!editMode && <div className="flex items-center gap-1.5 mb-4 text-[11px]" style={{ color: MUTED }}><Lock size={12} /> Solo lectura</div>}
            {editMode && <div className="mb-4" />}

            <div className="flex flex-col gap-3">
              <Field label="Marca / cliente" muted={MUTED}>
                <input value={draft.marca} disabled={!editMode} onChange={(e) => setDraft({ ...draft, marca: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <Field label="Producto" muted={MUTED}>
                <input value={draft.producto} disabled={!editMode} onChange={(e) => setDraft({ ...draft, producto: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <div className="flex gap-3">
                <Field label="Precio (USD)" muted={MUTED}>
                  <input type="number" value={draft.precio} disabled={!editMode} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} style={inputStyle(!editMode)} />
                </Field>
                <Field label="Videos" muted={MUTED}>
                  <input type="number" value={draft.videos} disabled={!editMode} onChange={(e) => setDraft({ ...draft, videos: e.target.value })} style={inputStyle(!editMode)} />
                </Field>
              </div>
              <Field label="WhatsApp" muted={MUTED}>
                <input value={draft.telefono} disabled={!editMode} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <Field label="Email" muted={MUTED}>
                <input value={draft.email} disabled={!editMode} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={inputStyle(!editMode)} />
              </Field>
              <Field label="Categoría" muted={MUTED}>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button key={c.key} disabled={!editMode} onClick={() => editMode && setDraft({ ...draft, categoria: c.key })} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={draft.categoria === c.key ? { background: c.color, color: "#0B0E14" } : { background: BG, color: MUTED }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {editMode ? (
              <button onClick={saveDetail} className="w-full mt-5 py-3 rounded-xl font-semibold text-sm" style={{ background: GOLD, color: "#1A1608" }}>
                Guardar cambios
              </button>
            ) : (
              <button onClick={() => setDetailDeal(null)} className="w-full mt-5 py-3 rounded-xl font-semibold text-sm" style={{ background: BORDER, color: MUTED }}>
                Cerrar
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
              <div className="flex items-center gap-2"><BookOpen size={16} color={GOLD} /><span className="font-display font-bold text-base">Notas</span></div>
              <button onClick={() => setNotesDeal(null)}><X size={20} color={MUTED} /></button>
            </div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>{notesDeal.marca || "Sin nombre"}</div>
            {!editMode && <div className="flex items-center gap-1.5 mb-4 text-[11px]" style={{ color: MUTED }}><Lock size={12} /> Solo lectura</div>}
            {editMode && <div className="mb-4" />}

            <div className="flex items-center gap-1.5 mb-2"><FileText size={13} color={GOLD} /><span className="text-xs font-semibold">Escritos</span></div>
            <div className="flex flex-col gap-2 mb-2">
              {(notesDeal.notes?.scripts || []).map((s) => (
                <div key={s.id} className="rounded-lg p-2.5 flex items-start justify-between gap-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  <span className="text-xs whitespace-pre-wrap" style={{ lineHeight: 1.4 }}>{s.text}</span>
                  {editMode && <button onClick={() => removeScript(s.id)} style={{ flexShrink: 0 }}><X size={13} color={MUTED} /></button>}
                </div>
              ))}
              {(notesDeal.notes?.scripts || []).length === 0 && <div className="text-xs" style={{ color: MUTED }}>Sin escritos guardados.</div>}
            </div>
            {editMode && (
              <div className="flex gap-2 mb-5">
                <textarea value={newScript} onChange={(e) => setNewScript(e.target.value)} placeholder="Pega el escrito..." rows={2} style={{ ...inputStyle(false), flex: 1, resize: "vertical" }} />
                <button onClick={addScript} className="px-3 rounded-xl flex items-center justify-center" style={{ background: GOLD, flexShrink: 0 }}><Plus size={16} color="#1A1608" /></button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-2 mt-4"><Link2 size={13} color={GOLD} /><span className="text-xs font-semibold">Links de referencia</span></div>
            <div className="flex flex-col gap-2 mb-2">
              {(notesDeal.notes?.links || []).map((l) => (
                <div key={l.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-xs break-all" style={{ color: "#5BB8E8" }}>{l.url}</a>
                  {editMode && <button onClick={() => removeLink(l.id)} style={{ flexShrink: 0 }}><X size={13} color={MUTED} /></button>}
                </div>
              ))}
              {(notesDeal.notes?.links || []).length === 0 && <div className="text-xs" style={{ color: MUTED }}>Sin links guardados.</div>}
            </div>
            {editMode && (
              <div className="flex gap-2 mb-5">
                <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="https://tiktok.com/..." style={inputStyle(false)} />
                <button onClick={addLink} className="px-3 rounded-xl flex items-center justify-center" style={{ background: GOLD, flexShrink: 0 }}><Plus size={16} color="#1A1608" /></button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-2 mt-4"><BookOpen size={13} color={GOLD} /><span className="text-xs font-semibold">Notas</span></div>
            {editMode ? (
              <textarea value={notesDeal.notes?.notas || ""} onChange={(e) => updateNotes(notesDeal.id, { notas: e.target.value })} placeholder="Notas libres..." rows={4} style={{ ...inputStyle(false), width: "100%", resize: "vertical" }} />
            ) : (
              <div className="text-xs p-2.5 rounded-lg" style={{ background: BG, border: `1px solid ${BORDER}`, color: notesDeal.notes?.notas ? WHITE : MUTED, minHeight: 60 }}>
                {notesDeal.notes?.notas || "Sin notas."}
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
