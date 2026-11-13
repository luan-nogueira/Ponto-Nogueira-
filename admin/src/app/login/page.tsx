"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Camera, Eye, EyeOff, Loader2, Lock, Mail, MapPin, Radio, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TrocaTema } from "@/components/Tema";

// Marca mostrada antes do login (a empresa só é conhecida depois que a pessoa entra).
// Para outro cliente, basta trocar os arquivos em public/ e estes textos.
const MARCA = {
  nome: "Nogueira Representações",
  logo: "/logo-empresa.png",
  simbolo: "/logo-marca.png",
};

const suave = [0.22, 1, 0.36, 1] as const;

function useAgora() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

function Relogio({ pequeno = false }: { pequeno?: boolean }) {
  const agora = useAgora();
  if (!agora) return <div className={pequeno ? "h-[4.5rem]" : "h-32"} />;
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const dia = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const data = dia.charAt(0).toUpperCase() + dia.slice(1);
  return (
    <div>
      <div className={`font-light tabular-nums tracking-tighter text-white ${pequeno ? "text-5xl" : "text-7xl xl:text-8xl"}`}>
        {hora.slice(0, 5)}
        <span className="text-neutral-600">{hora.slice(5)}</span>
      </div>
      <div className={`mt-2 text-neutral-400 ${pequeno ? "text-xs" : "text-sm"}`}>{data} · Horário de Brasília</div>
    </div>
  );
}

const RECURSOS = [
  { icone: Camera, titulo: "Foto em cada batida", texto: "Comprovante com selfie, hora do servidor e local." },
  { icone: MapPin, titulo: "Cerca virtual por local", texto: "O ponto só é aceito dentro do endereço de trabalho." },
  { icone: Radio, titulo: "Equipe ao vivo", texto: "Veja quem está trabalhando agora, direto no mapa." },
];

function FormLogin() {
  const router = useRouter();
  const volta = useSearchParams().get("volta") ?? "/";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
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
      transition={{ duration: 0.5, ease: suave, delay: 0.1 }}
      className="w-full max-w-[400px]"
    >
      <div className="flex flex-col items-center text-center">
        <div className="hidden h-36 w-36 items-center justify-center rounded-3xl bg-[#fff] p-3 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5 md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARCA.logo} alt={MARCA.nome} className="h-full w-full object-contain" />
        </div>
        <h1 className="mt-0 text-2xl font-semibold tracking-tight md:mt-7 md:text-[1.75rem]">Bem-vindo de volta</h1>
        <p className="mt-2 text-sm text-suave">Entre com o e-mail e a senha cadastrados para acessar o painel.</p>
      </div>

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="rotulo">E-mail</span>
          <span className="relative mt-1.5 block">
            <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className="campo h-12 pl-10"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com.br"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </span>
        </label>
        <label className="block">
          <span className="rotulo">Senha</span>
          <span className="relative mt-1.5 block">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className="campo h-12 pl-10 pr-11"
              type={verSenha ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-tinta"
            >
              {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
      </div>

      {erro && (
        <motion.p
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}
          className="mt-4 rounded-lg border border-perigo/20 bg-red-50 px-3 py-2.5 text-sm text-perigo"
        >
          {erro}
        </motion.p>
      )}

      <button className="botao group mt-6 h-12 w-full text-[15px]" disabled={enviando}>
        {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
        {enviando ? "Entrando" : "Entrar"}
        {!enviando && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
      </button>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-suave">
        <ShieldCheck size={14} /> Acesso restrito a administradores da empresa
      </p>
    </motion.form>
  );
}

function SimboloMarca({ tamanho = "h-11 w-11" }: { tamanho?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-[#fff] p-1.5 ${tamanho}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARCA.simbolo} alt="" className="h-full w-full object-contain" />
    </span>
  );
}

export default function PaginaLogin() {
  const ano = new Date().getFullYear();
  return (
    <div className="grid min-h-dvh md:grid-cols-[1.05fr_1fr]">
      {/* lado da marca (computador) */}
      <section className="sempre-escuro relative hidden overflow-hidden bg-tinta px-12 py-10 md:flex md:flex-col md:justify-between xl:px-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 30% 45%, black 20%, transparent 75%)",
          }}
        />
        <motion.div
          className="pointer-events-none absolute -left-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl"
          animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-[#1e3a8a]/25 blur-3xl"
          animate={{ x: [0, -40, 0], y: [0, -20, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative flex items-center gap-3">
          <SimboloMarca />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-white">{MARCA.nome}</div>
            <div className="text-xs text-neutral-400">Controle de ponto</div>
          </div>
        </motion.div>

        <motion.div
          className="relative max-w-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: suave }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulso rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Sistema no ar
          </span>
          <div className="mt-6"><Relogio /></div>
          <p className="mt-6 text-lg leading-relaxed text-neutral-300">
            Sua equipe em tempo real. Cada batida com foto, local e hora certa.
          </p>
          <ul className="mt-10 space-y-5">
            {RECURSOS.map(({ icone: Icone, titulo, texto }, i) => (
              <motion.li
                key={titulo}
                className="flex items-start gap-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: suave, delay: 0.3 + i * 0.1 }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white">
                  <Icone size={18} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{titulo}</span>
                  <span className="block text-sm text-neutral-400">{texto}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <div className="relative flex items-center justify-between text-xs text-neutral-500">
          <span>© {ano} {MARCA.nome}</span>
          <span>Controle de ponto com cerca virtual</span>
        </div>
      </section>

      {/* lado do formulário */}
      <section className="relative flex min-h-dvh flex-col bg-white">
        {/* celular: faixa preta com a marca e o relógio no topo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: suave }}
          className="sempre-escuro relative overflow-hidden rounded-b-[2rem] bg-tinta px-6 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] md:hidden"
        >
          <motion.div
            className="pointer-events-none absolute -right-16 -top-10 h-56 w-56 rounded-full bg-white/10 blur-3xl"
            animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative flex items-center justify-between">
            <span className="flex items-center gap-3">
              <SimboloMarca tamanho="h-10 w-10" />
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-white">{MARCA.nome}</span>
                <span className="block text-xs text-neutral-400">Controle de ponto</span>
              </span>
            </span>
            <TrocaTema id="tema-login-celular" escuro />
          </div>
          <div className="relative mt-7"><Relogio pequeno /></div>
        </motion.div>

        <TrocaTema className="absolute right-6 top-6 hidden md:inline-flex" />

        {/* formulário centralizado na vertical e na horizontal */}
        <div className="flex flex-1 items-start justify-center px-6 pb-10 pt-12 md:items-center md:px-10 md:py-16">
          <Suspense>
            <FormLogin />
          </Suspense>
        </div>

        <div className="hidden pb-6 text-center text-xs text-suave md:block">
          Problemas para entrar? Fale com o responsável pelo sistema na sua empresa.
        </div>
      </section>
    </div>
  );
}
