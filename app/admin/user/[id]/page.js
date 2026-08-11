"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  ArrowLeft, Eye, Pencil, MessageCircle, Mail, ChevronRight, Trash2,
  BookOpen, Link2, FileText, Lock, Unlock,
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

export default function AdminUserDetail() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const userId = params.id;

  const [me, setMe] = useState(null);
  const [targetProfile, setTargetProfile] = useState(null);
  const [deals, setDeals] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState("activos");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: myProf } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!myProf?.is_admin) return router.replace("/dashboard");
      setMe(myProf);

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

  const waLink = (phone) => {
    const digits = (phone || "").replace(/[^0-9]/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", WHITE = "#F5F3EC", MUTED = "#8C8574";

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

        {/* view/edit mode toggle */}
        <div className="flex gap-2 rounded-xl p-1" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <button
            onClick={() => setEditMode(false)}
            className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold"
            style={!editMode ? { background: GOLD, color: "#1A1608" } : { color: MUTED }}
          >
            <Eye size={14} /> Ver
          </button>
          <button
            onClick={() => setEditMode(true)}
            className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold"
            style={editMode ? { background: "#E5484D", color: "#fff" } : { color: MUTED }}
          >
            <Pencil size={14} /> Editar
          </button>
        </div>
        {editMode && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: "#F2994A" }}>
            <Unlock size={12} /> Modo edición activo — los cambios afectan la cuenta de {targetProfile?.full_name || "esta persona"}
          </div>
        )}
        {!editMode && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: MUTED }}>
            <Lock size={12} /> Modo de solo lectura
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
                {editMode && idx > -1 && (
                  <button onClick={() => deleteDeal(deal)} className="p-2 rounded-lg" style={{ background: "#E5484D22" }}>
                    <Trash2 size={16} color="#E5484D" />
                  </button>
                )}
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
                        <button
                          onClick={() => jumpStage(deal, s)}
                          disabled={!editMode}
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ background: i <= idx ? STAGE_COLORS[s] : BORDER, cursor: editMode ? "pointer" : "default" }}
                          title={STAGE_LABELS[s]}
                        />
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

              {/* notes — always visible in view mode, read-only */}
              {(deal.notes?.scripts?.length > 0 || deal.notes?.links?.length > 0 || deal.notes?.notas?.trim()) && (
                <div className="mt-3.5 pt-3.5" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-1.5 mb-2"><BookOpen size={13} color={GOLD} /><span className="text-xs font-semibold">Notas</span></div>
                  {deal.notes?.scripts?.map((s) => (
                    <div key={s.id} className="flex items-start gap-1.5 mb-1.5">
                      <FileText size={12} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span className="text-xs whitespace-pre-wrap" style={{ color: MUTED }}>{s.text}</span>
                    </div>
                  ))}
                  {deal.notes?.links?.map((l) => (
                    <div key={l.id} className="flex items-center gap-1.5 mb-1.5">
                      <Link2 size={12} color={MUTED} style={{ flexShrink: 0 }} />
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-xs break-all" style={{ color: "#5BB8E8" }}>{l.url}</a>
                    </div>
                  ))}
                  {deal.notes?.notas?.trim() && <div className="text-xs mt-1" style={{ color: MUTED }}>{deal.notes.notas}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
