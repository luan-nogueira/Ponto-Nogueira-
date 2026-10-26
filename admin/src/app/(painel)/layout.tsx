"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sessao, useUsuario } from "@/components/Sessao";
import { supabase } from "@/lib/supabase";

const menu = [
  { href: "/", nome: "Ao vivo" },
  { href: "/batidas", nome: "Batidas" },
  { href: "/alertas", nome: "Alertas" },
  { href: "/colaboradores", nome: "Colaboradores" },
  { href: "/locais", nome: "Locais" },
];

function Estrutura({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const usuario = useUsuario();
  const [aberto, setAberto] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-gray-200 bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-emerald-800">Ponto</span>
          <button className="md:hidden text-sm text-gray-600" onClick={() => setAberto(!aberto)}>Menu</button>
        </div>
        <nav className={`${aberto ? "block" : "hidden"} px-2 pb-4 md:block`}>
          {menu.map((item) => {
            const ativo = item.href === "/" ? caminho === "/" : caminho.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setAberto(false)}
                className={`block rounded-md px-3 py-2 text-sm ${ativo ? "bg-emerald-50 font-medium text-emerald-800" : "text-gray-700 hover:bg-gray-50"}`}
              >
                {item.nome}
              </Link>
            );
          })}
          <div className="mt-6 border-t border-gray-100 px-3 pt-4 text-xs text-gray-500">
            <div className="truncate">{usuario.nome}</div>
            <button className="mt-1 underline" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return (
    <Sessao>
      <Estrutura>{children}</Estrutura>
    </Sessao>
  );
}
