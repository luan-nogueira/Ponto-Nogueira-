"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TrocaTema } from "@/components/Tema";

function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!agora) return <div className="h-24" />;
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <div className="text-7xl font-light tabular-nums tracking-tighter text-white md:text-8xl">
      {hora.slice(0, 5)}
      <span className="text-neutral-600">{hora.slice(5)}</span>
    </div>
  );
}

function FormLogin() {
  const router = useRouter();
  const volta = useSearchParams().get("volta") ?? "/";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEnviando(false);
    if (error) {
      setErro("E-mail ou senha incorretos");
      return;
    }
    router.replace(volta.startsWith("/") ? volta : "/");
  }

  return (
    <motion.form
      onSubmit={entrar}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      className="w-full max-w-sm space-y-6"
    >
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-2 text-sm text-suave">Acesse o painel com o e-mail cadastrado.</p>
      </div>
      <div className="space-y-4">
        <label className="block">
          <span className="rotulo">E-mail</span>
          <input className="campo mt-1.5" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="rotulo">Senha</span>
          <input className="campo mt-1.5" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
      </div>
      {erro && (
        <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="text-sm text-perigo">
          {erro}
        </motion.p>
      )}
      <button className="botao group w-full py-3" disabled={enviando}>
        {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
        {enviando ? "Entrando" : "Entrar"}
        {!enviando && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
      </button>
    </motion.form>
  );
}

export default function PaginaLogin() {
  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      <section className="sempre-escuro relative hidden overflow-hidden bg-tinta p-12 md:flex md:flex-col md:justify-between">
        {/* grade sutil ao fundo */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)",
          }}
        />
        <motion.div
          className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-white/10 blur-3xl"
          animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative flex items-center gap-2 text-sm text-neutral-400">
          <span className="h-2 w-2 rounded-full bg-white" /> Ponto
        </motion.div>
        <motion.div
          className="relative space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <Relogio />
          <p className="max-w-md text-lg leading-relaxed text-neutral-400">
            Sua equipe em tempo real. Cada batida com foto, local e hora certa.
          </p>
        </motion.div>
        <div className="relative text-xs text-neutral-600">Controle de ponto com cerca virtual</div>
      </section>
      <section className="relative flex items-center justify-center bg-white p-6">
        <TrocaTema className="absolute right-5 top-5" />
        <Suspense>
          <FormLogin />
        </Suspense>
      </section>
    </div>
  );
}
