"use client";

import { useCallback, useEffect, useState } from "react";
import Mapa from "@/components/Mapa";
import { FotoBatida } from "@/components/FotoBatida";
import { useUsuario } from "@/components/Sessao";
import { supabase } from "@/lib/supabase";
import { dataHora, inicioDoDia, nomeStatus, nomeTipo } from "@/lib/formato";
import { LinhasEsqueleto, SeloStatus, Vazio } from "@/components/ui";
import type { Batida, Local, StatusBatida, Usuario } from "@/lib/tipos";

function hojeISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export default function PaginaBatidas() {
  const eu = useUsuario();
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [colaborador, setColaborador] = useState("");
  const [status, setStatus] = useState<"" | StatusBatida>("");
  const [pessoas, setPessoas] = useState<Pick<Usuario, "id" | "nome">[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [batidas, setBatidas] = useState<Batida[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.from("usuarios").select("id, nome").eq("papel", "colaborador").order("nome")
      .then(({ data }) => setPessoas(data ?? []));
    supabase.from("locais").select("*").then(({ data }) => setLocais((data as Local[]) ?? []));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const fim = new Date(inicioDoDia(new Date(`${ate}T12:00:00-03:00`)));
    fim.setDate(fim.getDate() + 1);
    let consulta = supabase
      .from("batidas")
      .select("*, usuarios!batidas_usuario_id_fkey(nome), locais(nome)")
      .gte("registrado_em", inicioDoDia(new Date(`${de}T12:00:00-03:00`)))
      .lt("registrado_em", fim.toISOString())
      .order("registrado_em", { ascending: false })
      .limit(1000);
    if (colaborador) consulta = consulta.eq("usuario_id", colaborador);
    if (status) consulta = consulta.eq("status", status);
    const { data } = await consulta;
    setBatidas((data as Batida[]) ?? []);
    setCarregando(false);
  }, [de, ate, colaborador, status]);

  useEffect(() => { carregar(); }, [carregar]);

  async function decidir(b: Batida, novo: StatusBatida) {
    await supabase.from("batidas")
      .update({ status: novo, revisado_por: eu.id, revisado_em: new Date().toISOString() })
      .eq("id", b.id);
    carregar();
  }

  function exportarCSV() {
    const linhas = [
      ["NSR", "Data e hora", "Colaborador", "Tipo", "Local", "Distância (m)", "Latitude", "Longitude", "Precisão (m)", "Situação", "Motivo", "Offline"],
      ...batidas.map((b) => [
        b.nsr ?? "", dataHora(b.registrado_em), b.usuarios?.nome ?? "", nomeTipo[b.tipo], b.locais?.nome ?? "",
        b.distancia_m != null ? Math.round(b.distancia_m) : "", b.lat, b.lng, b.precisao_m ?? "",
        nomeStatus[b.status], b.motivo_rejeicao ?? "", b.sincronizada_offline ? "sim" : "não",
      ]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `batidas_${de}_a_${ate}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <h1 className="titulo">Batidas</h1>

      <div className="cartao flex flex-wrap items-end gap-3 p-4 animate-entrar [animation-delay:60ms]">
        <label className="text-sm">De<input type="date" className="campo mt-1" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="text-sm">Até<input type="date" className="campo mt-1" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <label className="text-sm">Colaborador
          <select className="campo mt-1" value={colaborador} onChange={(e) => setColaborador(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="text-sm">Situação
          <select className="campo mt-1" value={status} onChange={(e) => setStatus(e.target.value as StatusBatida | "")}>
            <option value="">Todas</option>
            <option value="valida">Válidas</option>
            <option value="pendente_revisao">Para revisar</option>
            <option value="rejeitada">Recusadas</option>
          </select>
        </label>
        <button className="botao-sec" onClick={exportarCSV} disabled={!batidas.length}>Exportar CSV</button>
      </div>

      <div className="cartao overflow-x-auto animate-entrar [animation-delay:120ms]">
        <table className="tabela">
          <thead>
            <tr><th>Foto</th><th>Data e hora</th><th>Colaborador</th><th>Tipo</th><th>Local</th><th>Situação</th><th>NSR</th></tr>
          </thead>
          <tbody>
            {batidas.map((b) => {
              const local = locais.find((l) => l.id === b.local_id);
              return [
                <tr key={b.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => setAberta(aberta === b.id ? null : b.id)}>
                  <td><FotoBatida caminho={b.foto_path} tamanho={40} /></td>
                  <td className="whitespace-nowrap">{dataHora(b.registrado_em)}{b.sincronizada_offline && <div className="text-xs text-suave">feita sem internet</div>}</td>
                  <td>{b.usuarios?.nome}</td>
                  <td>{nomeTipo[b.tipo]}</td>
                  <td>{b.locais?.nome ?? "—"}{b.distancia_m != null && <div className="text-xs text-suave">{Math.round(b.distancia_m)} m do local</div>}</td>
                  <td>
                    <SeloStatus status={b.status} />
                    {b.motivo_rejeicao && <div className="mt-1 max-w-64 text-xs text-suave">{b.motivo_rejeicao}</div>}
                  </td>
                  <td className="text-suave">{b.nsr ?? "—"}</td>
                </tr>,
                aberta === b.id && (
                  <tr key={`${b.id}-mapa`}>
                    <td colSpan={7} className="bg-neutral-50 p-4 animate-entrar">
                      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
                        <Mapa
                          className="h-72 w-full rounded-lg"
                          marcadores={[{ id: b.id, lat: b.lat, lng: b.lng, cor: b.dentro_cerca ? "#0a0a0a" : "#dc2626", rotulo: "Onde bateu", pulsar: true }]}
                          cercas={local ? [{ id: local.id, lat: local.lat, lng: local.lng, raio: local.raio_metros, nome: local.nome }] : []}
                        />
                        <div className="space-y-2 text-sm">
                          <FotoBatida caminho={b.foto_path} tamanho={200} />
                          <div>GPS: {b.lat.toFixed(6)}, {b.lng.toFixed(6)}{b.precisao_m != null && ` (±${Math.round(b.precisao_m)} m)`}</div>
                          {b.hora_dispositivo && <div>Hora no celular: {dataHora(b.hora_dispositivo)}</div>}
                          {b.mock_location && <div className="text-perigo">GPS falso detectado</div>}
                          {b.status === "pendente_revisao" && (
                            <div className="flex gap-2 pt-2">
                              <button className="botao" onClick={() => decidir(b, "valida")}>Aceitar</button>
                              <button className="botao-sec" onClick={() => decidir(b, "rejeitada")}>Recusar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
            {carregando && batidas.length === 0 && <LinhasEsqueleto colunas={7} />}
            {!carregando && batidas.length === 0 && <Vazio colunas={7} texto="Nenhuma batida no período." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
