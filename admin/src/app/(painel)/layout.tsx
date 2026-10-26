"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Building2, Clock, FileText, LogOut, MapPin, Menu, Radio, Users, X } from "lucide-react";
import { Sessao, useEmpresa, useUsuario } from "@/components/Sessao";
import { Avatar } from "@/components/ui";
import { TrocaTema } from "@/components/Tema";
import { supabase } from "@/lib/supabase";

const menu = [
  { href: "/", nome: "Ao vivo", curto: "Ao vivo", icone: Radio },
  { href: "/batidas", nome: "Batidas", curto: "Batidas", icone: Clock },
  { href: "/espelho", nome: "Espelho de ponto", curto: "Espelho", icone: FileText },
  { href: "/alertas", nome: "Alertas", icone: Bell },
  { href: "/colaboradores", nome: "Colaboradores", curto: "Equipe", icone: Users },
  { href: "/locais", nome: "Locais", icone: MapPin },
  { href: "/empresa", nome: "Empresa", icone: Building2, soAdmin: true },
];

function Estrutura({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const usuario = useUsuario();
  const { empresa } = useEmpresa();
  const [aberto, setAberto] = useState(false);

  const itens = menu.filter((item) => !item.soAdmin || usuario.papel === "admin");
  const abas = itens.filter((item) => item.curto);

  const navegacao = (
    <nav className="flex flex-col gap-1 px-3">
      {itens.map((item, i) => {
        const ativo = item.href === "/" ? caminho === "/" : caminho.startsWith(item.href);
        const Icone = item.icone;
        return (
          <motion.div key={item.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
            <Link
              href={item.href}
              onClick={() => setAberto(false)}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
                ativo ? "text-tinta" : "text-neutral-400 hover:text-white"
              }`}
            >
              {ativo && (
                <motion.span
                  layoutId="menu-ativo"
                  className="absolute inset-0 rounded-xl bg-white"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icone size={17} strokeWidth={ativo ? 2.2 : 1.8} className="relative" />
              <span className={`relative ${ativo ? "font-medium" : ""}`}>{item.nome}</span>
            </Link>
          </motion.div>
        );
      })}
    </nav>
  );

  const marca = (
    <Link href="/" className="flex min-w-0 items-center gap-3">
      {empresa.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={empresa.logo_url} alt={empresa.nome} className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-tinta">
          {empresa.nome.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-white">{empresa.nome}</span>
        <span className="block text-[11px] uppercase tracking-[0.14em] text-neutral-500">Ponto</span>
      </span>
    </Link>
  );

  const rodape = (id: string) => (
    <div className="space-y-3">
    <div className="flex items-center justify-between px-5">
      <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Tema</span>
      <TrocaTema id={`tema-${id}`} escuro />
    </div>
    <div className="mx-3 flex items-center gap-3 rounded-xl border border-white/10 p-3">
      <Avatar nome={usuario.nome} escuro={false} tamanho="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-white">{usuario.nome}</div>
        <div className="text-[11px] capitalize text-neutral-500">{usuario.papel}</div>
      </div>
      <button title="Sair" className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white" onClick={() => supabase.auth.signOut()}>
        <LogOut size={16} />
      </button>
    </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Menu lateral (computador) */}
      <aside className="sempre-escuro border-r print:hidden sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-tinta py-6 md:flex">
        <div className="space-y-8">
          <div className="px-5">{marca}</div>
          {navegacao}
        </div>
        {rodape("lado")}
      </aside>

      {/* Barra superior (celular) */}
      <header className="sempre-escuro print:hidden sticky top-0 z-[1000] flex items-center justify-between bg-tinta px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        {marca}
      </header>
      <AnimatePresence>
        {aberto && (
          <motion.div
            key="fundo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-black/40 backdrop-blur-[2px] md:hidden"
            onClick={() => setAberto(false)}
          />
        )}
        {aberto && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="sempre-escuro fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+76px)] z-[1000] space-y-4 rounded-2xl bg-tinta py-4 shadow-2xl md:hidden"
          >
            {navegacao}
            {rodape("celular")}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:py-10 print:p-0">
        <div key={caminho} className="mx-auto max-w-7xl animate-entrar">{children}</div>
      </main>

      {/* Barra de abas (celular): os atalhos mais usados ficam ao alcance do polegar */}
      <nav className="sempre-escuro fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[1000] flex items-center justify-around rounded-2xl bg-tinta/95 p-1.5 shadow-2xl backdrop-blur md:hidden print:hidden">
        {abas.map((item) => {
          const ativo = item.href === "/" ? caminho === "/" : caminho.startsWith(item.href);
          const Icone = item.icone;
          return (
            <Link key={item.href} href={item.href} onClick={() => setAberto(false)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition-colors ${ativo ? "text-tinta" : "text-neutral-400"}`}>
              {ativo && <motion.span layoutId="aba-ativa" className="absolute inset-0 rounded-xl bg-white" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icone size={19} strokeWidth={ativo ? 2.2 : 1.8} className="relative" />
              <span className="relative font-medium">{item.curto}</span>
            </Link>
          );
        })}
        <button onClick={() => setAberto(!aberto)}
          className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] ${aberto ? "text-white" : "text-neutral-400"}`}>
          {aberto ? <X size={19} /> : <Menu size={19} />}
          <span className="font-medium">Mais</span>
        </button>
      </nav>
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
