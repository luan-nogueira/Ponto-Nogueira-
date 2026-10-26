"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Mapa, { type Marcador } from "@/components/Mapa";
import { FotoBatida } from "@/components/FotoBatida";
import { supabase } from "@/lib/supabase";
import { corStatus, haQuanto, hora, inicioDoDia, nomeStatus, nomeTipo } from "@/lib/formato";
import type { Batida, Local, SituacaoColaborador } from "@/lib/tipos";

const corSituacao = { trabalhando: "#059669", intervalo: "#d97706", fora_jornada: "#9ca3af" };
const nomeSituacao = { trabalhando: "Trabalhando", intervalo: "Intervalo", fora_jornada: "Fora da jornada" };

export default function AoVivo() {
  const [equipe, setEquipe] = useState<SituacaoColaborador[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [batidas, setBatidas] = useState<Batida[]>([]);
  const [alertas, setAlertas] = useState(0);
  const [foco, setFoco] = useState<[number, number] | undefined>();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const [e, l, b, a] = await Promise.all([
      supabase.rpc("painel_colaboradores"),
      supabase.from("locais").select("*").eq("ativo", true),
      supabase
        .from("batidas")
        .select("*, usuarios!batidas_usuario_id_fkey(nome), locais(nome)")
        .gte("registrado_em", inicioDoDia())
        .order("registrado_em", { ascending: false })
        .limit(50),
      supabase.from("alertas").select("id", { count: "exact", head: true }).eq("lido", false),
    ]);
    setEquipe((e.data as SituacaoColaborador[]) ?? []);
    setLocais((l.data as Local[]) ?? []);
    setBatidas((b.data as Batida[]) ?? []);
    setAlertas(a.count ?? 0);
  }, []);

  useEffect(() => {
    carregar();
    // atualiza quando chega batida, localização ou alerta (com um pequeno atraso para agrupar)
    const recarregar = () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(carregar, 1500);
    };
    const canal = supabase
      .channel("ao-vivo")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "batidas" }, recarregar)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "localizacoes" }, recarregar)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alertas" }, recarregar)
      .subscribe();
    const relogio = setInterval(carregar, 60_000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(relogio);
    };
  }, [carregar]);

  const contagem = {
    trabalhando: equipe.filter((c) => c.situacao === "trabalhando").length,
    intervalo: equipe.filter((c) => c.situacao === "intervalo").length,
    fora_jornada: equipe.filter((c) => c.situacao === "fora_jornada").length,
  };

  const marcadores: Marcador[] = equipe
    .filter((c) => c.lat != null && c.lng != null && c.situacao !== "fora_jornada")
    .map((c) => ({
      id: c.usuario_id,
      lat: c.lat!,
      lng: c.lng!,
      cor: corSituacao[c.situacao],
      rotulo: `${c.nome} · ${haQuanto(c.posicao_em)}`,
      detalhe: (
        <div className="text-sm">
          <div className="font-medium">{c.nome}</div>
          <div>{nomeSituacao[c.situacao]}</div>
          <div>
            {c.ultima_batida_tipo && nomeTipo[c.ultima_batida_tipo]} às {hora(c.ultima_batida_em)}
            {c.ultima_batida_local && ` em ${c.ultima_batida_local}`}
          </div>
          <div className="text-gray-500">Posição {haQuanto(c.posicao_em)}{c.bateria != null && ` · bateria ${c.bateria}%`}</div>
        </div>
      ),
    }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Ao vivo</h1>
        <span className="text-xs text-gray-500">Atualiza sozinho</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero titulo="Trabalhando" valor={contagem.trabalhando} cor="text-emerald-700" />
        <Numero titulo="Em intervalo" valor={contagem.intervalo} cor="text-amber-700" />
        <Numero titulo="Fora da jornada" valor={contagem.fora_jornada} cor="text-gray-600" />
        <Link href="/alertas">
          <Numero titulo="Alertas não lidos" valor={alertas} cor={alertas ? "text-red-700" : "text-gray-600"} />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="cartao overflow-hidden lg:col-span-2">
          <Mapa
            marcadores={marcadores}
            cercas={locais.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, raio: l.raio_metros, nome: l.nome }))}
            centro={foco}
          />
        </div>
        <div className="cartao max-h-[480px] overflow-y-auto">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-medium">Equipe</h2>
          {equipe.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum colaborador cadastrado.</p>}
          {equipe.map((c) => (
            <button
              key={c.usuario_id}
              className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-2 text-left hover:bg-gray-50"
              onClick={() => c.lat != null && c.lng != null && setFoco([c.lat, c.lng])}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corSituacao[c.situacao] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{c.nome}</span>
                <span className="block truncate text-xs text-gray-500">
                  {c.ultima_batida_tipo
                    ? `${nomeTipo[c.ultima_batida_tipo]} ${hora(c.ultima_batida_em)} · ${c.ultima_batida_local ?? ""}`
                    : "Sem batida hoje"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="cartao overflow-x-auto">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-medium">Batidas de hoje</h2>
        <table className="tabela">
          <thead>
            <tr><th>Foto</th><th>Hora</th><th>Colaborador</th><th>Tipo</th><th>Local</th><th>Situação</th></tr>
          </thead>
          <tbody>
            {batidas.map((b) => (
              <tr key={b.id}>
                <td><FotoBatida caminho={b.foto_path} tamanho={36} /></td>
                <td>{hora(b.registrado_em)}</td>
                <td>{b.usuarios?.nome}</td>
                <td>{nomeTipo[b.tipo]}</td>
                <td>{b.locais?.nome ?? "—"}{b.distancia_m != null && <span className="text-gray-500"> · {Math.round(b.distancia_m)} m</span>}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs ${corStatus[b.status]}`}>{nomeStatus[b.status]}</span>
                  {b.motivo_rejeicao && <div className="mt-1 text-xs text-gray-500">{b.motivo_rejeicao}</div>}
                </td>
              </tr>
            ))}
            {batidas.length === 0 && <tr><td colSpan={6} className="text-gray-500">Nenhuma batida hoje.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Numero({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div className="cartao p-4">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold ${cor}`}>{valor}</div>
    </div>
  );
}
