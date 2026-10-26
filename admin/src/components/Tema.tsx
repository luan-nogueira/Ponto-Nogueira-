"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";

import { CHAVE, type Tema } from "@/lib/tema";

function aplicar(tema: Tema) {
  const escuro = tema === "escuro" || (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

const opcoes = [
  { valor: "claro" as const, nome: "Claro", icone: Sun },
  { valor: "escuro" as const, nome: "Escuro", icone: Moon },
  { valor: "sistema" as const, nome: "Automático", icone: Monitor },
];

/** Botões para alternar entre tema claro, escuro e o do sistema. */
export function TrocaTema({ id = "tema", escuro = false, className = "" }: { id?: string; escuro?: boolean; className?: string }) {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    try {
      setTema((localStorage.getItem(CHAVE) as Tema) || "sistema");
    } catch {
      setTema("sistema");
    }
  }, []);

  useEffect(() => {
    if (!tema) return;
    aplicar(tema);
    if (tema !== "sistema") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const mudar = () => aplicar("sistema");
    mq.addEventListener("change", mudar);
    return () => mq.removeEventListener("change", mudar);
  }, [tema]);

  function escolher(t: Tema) {
    setTema(t);
    try {
      localStorage.setItem(CHAVE, t);
    } catch {}
  }

  return (
    <div className={`inline-flex rounded-full border p-0.5 ${escuro ? "border-white/10" : "border-linha"} ${className}`} role="radiogroup" aria-label="Tema">
      {opcoes.map(({ valor, nome, icone: Icone }) => {
        const ativo = tema === valor;
        return (
          <button
            key={valor}
            role="radio"
            aria-checked={ativo}
            title={nome}
            onClick={() => escolher(valor)}
            className={`relative flex h-7 w-8 items-center justify-center rounded-full transition-colors ${ativo ? (escuro ? "text-tinta" : "text-white") : escuro ? "text-neutral-500 hover:text-white" : "text-neutral-400 hover:text-tinta"}`}
          >
            {ativo && (
              <motion.span layoutId={id} className={`absolute inset-0 rounded-full ${escuro ? "bg-white" : "bg-tinta"}`} transition={{ type: "spring", stiffness: 500, damping: 35 }} />
            )}
            <motion.span key={ativo ? "a" : "i"} className="relative" initial={ativo ? { rotate: -90, scale: 0.6 } : false} animate={{ rotate: 0, scale: 1 }}>
              <Icone size={14} />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
