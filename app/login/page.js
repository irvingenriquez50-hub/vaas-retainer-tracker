"use client";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-px vaas-gold-bg" />
        <div className="w-1 h-1 rounded-full vaas-gold-bg" />
        <div className="w-14 h-px vaas-gold-bg" />
      </div>
      <div className="font-display font-bold text-5xl tracking-widest leading-none">
        <span className="text-[#F5F3EC]">V</span>
        <span className="vaas-gold-text">AA</span>
        <span className="text-[#F5F3EC]">S</span>
      </div>
      <div className="text-[11px] text-white tracking-[0.4em] mt-2 font-medium">RETAINER TRACKER</div>
      <div className="flex items-center gap-3 mt-2 mb-10">
        <div className="w-14 h-px vaas-gold-bg" />
        <div className="w-1 h-1 rounded-full vaas-gold-bg" />
        <div className="w-14 h-px vaas-gold-bg" />
      </div>

      <button
        onClick={handleGoogleLogin}
        className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-neutral-100 transition"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 009 18z" />
          <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.17.27-1.7V4.97H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
        </svg>
        Continuar con Google
      </button>

      <p className="text-neutral-500 text-xs mt-8 text-center max-w-xs">
        Al entrar aceptas usar esta herramienta como parte de la comunidad VAAS.
      </p>
    </div>
  );
}
