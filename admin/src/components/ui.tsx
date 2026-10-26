"use client";

import { useEffect, useRef, useState } from "react";
import type { StatusBatida } from "@/lib/tipos";
import { nomeStatus } from "@/lib/formato";

/** Número que sobe até o valor (anima ao aparecer e quando muda). */
export function Contador({ valor, className }: { valor: number; className?: string }) {
  const [mostrado, setMostrado] = useState(0);
  const anterior = useRef(0);
  useEffect(() => {
    const inicio = anterior.current;
    const t0 = performance.now();
    const duracao = 700;
    let quadro = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / duracao);
      const suave = 1 - Math.pow(1 - p, 3);
      setMostrado(Math.round(inicio + (valor - inicio) * suave));
      if (p < 1) quadro = requestAnimationFrame(passo);
      else anterior.current = valor;
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor]);
  return <span className={`tabular-nums tracking-tight ${className ?? ""}`}>{mostrado}</span>;
}

/** Bolinha pulsando, indica que algo está ao vivo. */
export function PontoVivo({ cor = "bg-tinta", tamanho = "h-2 w-2" }: { cor?: string; tamanho?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${tamanho}`}>
      <span className={`absolute inset-0 rounded-full ${cor} animate-pulso`} />
      <span className={`relative inline-flex rounded-full ${tamanho} ${cor}`} />
    </span>
  );
}

export function Cabecalho({ titulo, subtitulo, children }: { titulo: string; subtitulo?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 animate-entrar">
      <div>
        <h1 className="titulo">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-suave">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const estiloStatus: Record<StatusBatida, string> = {
  valida: "bg-tinta text-white",
  pendente_revisao: "border border-tinta text-tinta",
  rejeitada: "bg-red-50 text-perigo",
};

export function SeloStatus({ status }: { status: StatusBatida }) {
  return <span className={`selo ${estiloStatus[status]}`}>{nomeStatus[status]}</span>;
}

export function LinhasEsqueleto({ linhas = 4, colunas }: { linhas?: number; colunas: number }) {
  return (
    <>
      {Array.from({ length: linhas }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: colunas }).map((_, j) => (
            <td key={j}><div className="esqueleto h-4 w-full max-w-40" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Vazio({ texto, colunas }: { texto: string; colunas: number }) {
  return (
    <tr>
      <td colSpan={colunas} className="py-12 text-center text-sm text-suave">{texto}</td>
    </tr>
  );
}

/** Iniciais para avatar ("João Silva" → "JS"). */
export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ nome, escuro = true, tamanho = "h-9 w-9" }: { nome: string; escuro?: boolean; tamanho?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tamanho} ${escuro ? "bg-tinta text-white" : "bg-neutral-100 text-tinta"}`}>
      {iniciais(nome)}
    </span>
  );
}
