"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { ArrowLeft, Trash2, ShieldOff } from "lucide-react";

const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n || 0);

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!prof?.is_admin) return router.replace("/dashboard");
      setProfile(prof);
      loadData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    // Nota: como admin, las políticas RLS ya te dejan ver todo (ver el SQL de RLS).
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    const { data: deals } = await supabase.from("deals").select("*");
    if (!profiles) return setError("No se pudo cargar la lista de usuarios.");

    const merged = profiles.map((p) => {
      const userDeals = (deals || []).filter((d) => d.user_id === p.id);
      const cerrados = userDeals.filter((d) => d.status !== "revision" && d.status !== "eliminado").length;
      const cobrado = userDeals.filter((d) => d.status === "pagado").reduce((s, d) => s + Number(d.precio || 0), 0);
      return { ...p, cerrados, cobrado };
    });
    setRows(merged);
  };

  const removeUserData = async (userId) => {
    if (!confirm("Esto borra TODOS los contratos y contactos de esta persona. ¿Seguro?")) return;
    await supabase.from("deals").delete().eq("user_id", userId);
    loadData();
  };

  const BG = "#000000", SURFACE = "#0E0E0C", BORDER = "#242119", GOLD = "#D6B860", MUTED = "#8C8574", WHITE = "#F5F3EC";

  return (
    <div className="min-h-screen pb-16" style={{ background: BG, color: WHITE }}>
      <div className="px-5 pt-6 pb-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => router.push("/dashboard")} className="p-2 rounded-lg" style={{ background: SURFACE }}>
          <ArrowLeft size={16} color={MUTED} />
        </button>
        <div>
          <div className="font-display font-bold text-lg">Panel de Admin</div>
          <div className="text-xs" style={{ color: MUTED }}>Todos los usuarios de VAAS Retainer Tracker</div>
        </div>
      </div>

      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "#2A1620", color: "#F19999" }}>{error}</div>}

      <div className="px-5 mt-4 flex flex-col gap-3">
        {rows === null && <div className="text-sm text-center py-10" style={{ color: MUTED }}>Cargando...</div>}
        {rows?.map((r) => (
          <div key={r.id} className="rounded-xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{r.full_name || r.email}</div>
                <div className="text-xs" style={{ color: MUTED }}>{r.email}</div>
              </div>
              <button onClick={() => removeUserData(r.id)} className="p-2 rounded-lg" style={{ background: "#E5484D22" }} title="Borrar todos los datos de este usuario">
                <Trash2 size={15} color="#E5484D" />
              </button>
            </div>
            <div className="flex gap-4 mt-3">
              <div>
                <div className="text-[10px]" style={{ color: MUTED }}>Contratos cerrados</div>
                <div className="font-mono-vaas text-sm">{r.cerrados}</div>
              </div>
              <div>
                <div className="text-[10px]" style={{ color: MUTED }}>Cobrado</div>
                <div className="font-mono-vaas text-sm" style={{ color: "#34D399" }}>{money(r.cobrado)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
