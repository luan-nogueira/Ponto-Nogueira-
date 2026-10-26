"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
    <form onSubmit={entrar} className="cartao w-full max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold text-emerald-800">Ponto · Painel</h1>
      <label className="block text-sm">
        E-mail
        <input className="campo mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm">
        Senha
        <input className="campo mt-1" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>
      {erro && <p className="text-sm text-red-700">{erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

export default function PaginaLogin() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <FormLogin />
      </Suspense>
    </div>
  );
}
