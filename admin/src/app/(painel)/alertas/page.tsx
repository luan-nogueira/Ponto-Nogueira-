"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dataHora, nomeAlerta } from "@/lib/formato";
import type { Alerta } from "@/lib/tipos";

export default function PaginaAlertas() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [soNaoLidos, setSoNaoLidos] = useState(true);

  const carregar = useCallback(async () => {
    let consulta = supabase.from("alertas").select("*, usuarios(nome)").order("criado_em", { ascending: false }).limit(200);
    if (soNaoLidos) consulta = consulta.eq("lido", false);
    const { data } = await consulta;
    setAlertas((data as Alerta[]) ?? []);
  }, [soNaoLidos]);
  useEffect(() => { carregar(); }, [carregar]);

  async function marcarLidos(ids: string[]) {
    if (!ids.length) return;
    await supabase.from("alertas").update({ lido: true }).in("id", ids);
    carregar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="titulo">Alertas</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-suave">
            <input type="checkbox" checked={soNaoLidos} onChange={(e) => setSoNaoLidos(e.target.checked)} /> Só não lidos
          </label>
          <button className="botao-sec" onClick={() => marcarLidos(alertas.filter((a) => !a.lido).map((a) => a.id))}>Marcar todos como lidos</button>
        </div>
      </div>
      <div className="cartao overflow-x-auto animate-entrar [animation-delay:120ms]">
        <table className="tabela">
          <thead><tr><th>Quando</th><th>Colaborador</th><th>Alerta</th><th>Detalhe</th><th></th></tr></thead>
          <tbody>
            {alertas.map((a) => (
              <tr key={a.id} className={a.lido ? "text-neutral-400" : ""}>
                <td className="whitespace-nowrap">{dataHora(a.criado_em)}</td>
                <td>{a.usuarios?.nome ?? "—"}</td>
                <td>{nomeAlerta[a.tipo]}</td>
                <td className="max-w-md text-xs">
                  {String(a.detalhes.motivo ?? "")}
                  {typeof a.detalhes.lat === "number" && (
                    <a className="ml-2 font-medium text-tinta underline-offset-4 hover:underline" target="_blank" rel="noreferrer"
                      href={`https://www.openstreetmap.org/?mlat=${a.detalhes.lat}&mlon=${a.detalhes.lng}#map=18/${a.detalhes.lat}/${a.detalhes.lng}`}>
                      ver no mapa
                    </a>
                  )}
                </td>
                <td className="text-right">{!a.lido && <button className="font-medium text-tinta underline-offset-4 hover:underline" onClick={() => marcarLidos([a.id])}>Lido</button>}</td>
              </tr>
            ))}
            {alertas.length === 0 && <tr><td colSpan={5} className="text-suave">Nenhum alerta.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
