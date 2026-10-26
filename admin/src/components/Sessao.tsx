"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Empresa, Usuario } from "@/lib/tipos";

interface DadosSessao {
  usuario: Usuario;
  empresa: Empresa;
  atualizarEmpresa: (e: Empresa) => void;
}

const Contexto = createContext<DadosSessao | null>(null);

function useSessao() {
  const sessao = useContext(Contexto);
  if (!sessao) throw new Error("useSessao fora de <Sessao>");
  return sessao;
}

// Usuário logado (sempre admin ou gestor dentro do painel).
export function useUsuario() {
  return useSessao().usuario;
}

// Empresa do usuário logado, com a logo; cada empresa cliente tem a sua.
export function useEmpresa() {
  const { empresa, atualizarEmpresa } = useSessao();
  return { empresa, atualizarEmpresa };
}

export function Sessao({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
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
      const { data: dadosEmpresa } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, logo_url")
        .eq("id", perfil.empresa_id)
        .single<Empresa>();
      setEmpresa(dadosEmpresa);
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
  if (!usuario || !empresa) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Carregando…</div>;
  }
  return (
    <Contexto.Provider value={{ usuario, empresa, atualizarEmpresa: setEmpresa }}>
      {children}
    </Contexto.Provider>
  );
}
