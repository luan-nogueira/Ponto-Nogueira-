"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Usuario } from "@/lib/tipos";

const Contexto = createContext<Usuario | null>(null);

// Usuário logado (sempre admin ou gestor dentro do painel).
export function useUsuario() {
  const usuario = useContext(Contexto);
  if (!usuario) throw new Error("useUsuario fora de <Sessao>");
  return usuario;
}

export function Sessao({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace(`/login?volta=${encodeURIComponent(caminho)}`);
        return;
      }
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id", data.session.user.id)
        .single<Usuario>();
      if (!perfil || !perfil.ativo || perfil.papel === "colaborador") {
        setErro("Esta conta não tem acesso ao painel. Use o aplicativo no celular.");
        return;
      }
      setUsuario(perfil);
    }
    carregar();
    const { data: escuta } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") router.replace("/login");
    });
    return () => escuta.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (erro) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{erro}</p>
        <button className="botao-sec" onClick={() => supabase.auth.signOut()}>Sair</button>
      </div>
    );
  }
  if (!usuario) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Carregando…</div>;
  }
  return <Contexto.Provider value={usuario}>{children}</Contexto.Provider>;
}
