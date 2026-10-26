"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Battery, Coffee, Moon, TriangleAlert, Zap } from "lucide-react";
import Mapa, { type Marcador } from "@/components/Mapa";
import { FotoBatida } from "@/components/FotoBatida";
import { Avatar, Cabecalho, Contador, PontoVivo, SeloStatus, iniciais } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { haQuanto, hora, inicioDoDia, nomeTipo } from "@/lib/formato";
import type { Batida, Local, SituacaoColaborador } from "@/lib/tipos";

const corSituacao = { trabalhando: "var(--color-tinta)", intervalo: "#737373", fora_jornada: "#e5e5e5" };
const nomeSituacao = { trabalhando: "Trabalhando", intervalo: "Em intervalo", fora_jornada: "Fora da jornada" };

export default function AoVivo() {
  const [equipe, setEquipe] = useState<SituacaoColaborador[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [batidas, setBatidas] = useState<Batida[] | null>(null);
  const [alertas, setAlertas] = useState(0);
  const [foco, setFoco] = useState<[number, number] | undefined>();
  const [atualizado, setAtualizado] = useState<Date | null>(null);
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
    setAtualizado(new Date());
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
      texto: iniciais(c.nome),
      pulsar: c.situacao === "trabalhando",
      rotulo: `${c.nome} · ${haQuanto(c.posicao_em)}`,
      detalhe: (
        <div className="min-w-44 space-y-1 text-sm">
          <div className="font-semibold">{c.nome}</div>
          <div className="text-neutral-500">{nomeSituacao[c.situacao]}</div>
          <div>
            {c.ultima_batida_tipo && nomeTipo[c.ultima_batida_tipo]} às {hora(c.ultima_batida_em)}
            {c.ultima_batida_local && ` em ${c.ultima_batida_local}`}
          </div>
          <div className="text-xs text-neutral-500">
            Posição {haQuanto(c.posicao_em)}
            {c.bateria != null && ` · bateria ${c.bateria}%`}
          </div>
        </div>
      ),
    }));

  const cartoes = [
    { titulo: "Trabalhando", valor: contagem.trabalhando, icone: Zap, escuro: true },
    { titulo: "Em intervalo", valor: contagem.intervalo, icone: Coffee },
    { titulo: "Fora da jornada", valor: contagem.fora_jornada, icone: Moon },
    { titulo: "Alertas", valor: alertas, icone: TriangleAlert, href: "/alertas", alerta: alertas > 0 },
  ];

  return (
    <div className="space-y-8">
      <Cabecalho
        titulo="Ao vivo"
        subtitulo={
          <span className="inline-flex items-center gap-2">
            <PontoVivo /> Atualizando em tempo real{atualizado && ` · ${hora(atualizado.toISOString())}`}
          </span>
        }
      />

      <div className="escalonado grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {cartoes.map((c) => {
          const Icone = c.icone;
          const conteudo = (
            <div
              className={`cartao cartao-vivo group relative h-full overflow-hidden p-5 ${
                c.escuro ? "border-tinta bg-tinta text-white" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <span className={`rotulo ${c.escuro ? "text-neutral-400" : ""}`}>{c.titulo}</span>
                <Icone size={18} className={c.alerta ? "text-perigo" : c.escuro ? "text-neutral-500" : "text-neutral-300"} />
              </div>
              <Contador valor={c.valor} className={`mt-4 block text-4xl font-medium md:text-5xl ${c.alerta ? "text-perigo" : ""}`} />
              {c.href && (
                <ArrowUpRight size={16} className="absolute bottom-4 right-4 text-neutral-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-tinta" />
              )}
            </div>
          );
          return c.href ? <Link key={c.titulo} href={c.href}>{conteudo}</Link> : <div key={c.titulo}>{conteudo}</div>;
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="cartao relative overflow-hidden p-1.5 animate-entrar [animation-delay:200ms]">
          <Mapa
            className="h-[520px] w-full rounded-xl"
            marcadores={marcadores}
            cercas={locais.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, raio: l.raio_metros, nome: l.nome }))}
            centro={foco}
          />
          <div className="pointer-events-none absolute right-5 top-5 z-[500] flex gap-2">
            {(["trabalhando", "intervalo"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs shadow backdrop-blur">
                <span className="h-2 w-2 rounded-full" style={{ background: corSituacao[s] }} /> {nomeSituacao[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="cartao flex max-h-[532px] flex-col animate-entrar [animation-delay:260ms]">
          <div className="flex items-center justify-between border-b border-linha px-5 py-4">
            <h2 className="font-semibold">Equipe</h2>
            <span className="rotulo">{equipe.length} pessoas</span>
          </div>
          <div className="escalonado flex-1 overflow-y-auto p-2">
            {equipe.length === 0 && <p className="p-6 text-center text-sm text-suave">Nenhum colaborador cadastrado.</p>}
            {equipe.map((c) => (
              <button
                key={c.usuario_id}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-neutral-50 active:scale-[0.99]"
                onClick={() => c.lat != null && c.lng != null && setFoco([c.lat, c.lng])}
              >
                <span className="relative">
                  <Avatar nome={c.nome} escuro={c.situacao === "trabalhando"} />
                  {c.situacao !== "fora_jornada" && (
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
                      <PontoVivo cor={c.situacao === "trabalhando" ? "bg-tinta" : "bg-neutral-400"} tamanho="h-2 w-2" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.nome}</span>
                  <span className="block truncate text-xs text-suave">
                    {c.ultima_batida_tipo
                      ? `${nomeTipo[c.ultima_batida_tipo]} ${hora(c.ultima_batida_em)} · ${c.ultima_batida_local ?? ""}`
                      : "Sem batida hoje"}
                  </span>
                </span>
                {c.bateria != null && c.situacao !== "fora_jornada" && (
                  <span className="flex items-center gap-1 text-[11px] text-suave"><Battery size={13} />{c.bateria}%</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cartao overflow-hidden animate-entrar [animation-delay:320ms]">
        <div className="flex items-center justify-between border-b border-linha px-5 py-4">
          <h2 className="font-semibold">Linha do tempo de hoje</h2>
          <Link href="/batidas" className="flex items-center gap-1 text-sm text-suave transition hover:text-tinta">
            Ver todas <ArrowUpRight size={14} />
          </Link>
        </div>
        <ol className="relative px-5 py-4">
          <span className="absolute bottom-6 left-[38px] top-6 w-px bg-linha" />
          {batidas === null &&
            Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 py-3"><div className="esqueleto h-9 w-9 rounded-full" /><div className="esqueleto h-4 w-64" /></li>
            ))}
          {batidas?.length === 0 && <li className="py-8 text-center text-sm text-suave">Nenhuma batida hoje ainda.</li>}
          <AnimatePresence initial={false}>
            {batidas?.map((b, i) => (
              <motion.li
                key={b.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.035 }}
                className="relative flex items-center gap-4 rounded-xl py-2.5 pl-1 pr-2 transition hover:bg-neutral-50"
              >
                <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-white ${
                  b.status === "rejeitada" ? "bg-red-100" : b.status === "valida" ? "bg-tinta" : "bg-neutral-300"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${b.status === "rejeitada" ? "bg-perigo" : "bg-white"}`} />
                </span>
                <span className="w-14 shrink-0 font-mono text-sm tabular-nums">{hora(b.registrado_em)}</span>
                <FotoBatida caminho={b.foto_path} tamanho={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <b className="font-medium">{b.usuarios?.nome}</b> <span className="text-suave">·</span> {nomeTipo[b.tipo]}
                  </span>
                  <span className="block truncate text-xs text-suave">
                    {b.motivo_rejeicao ?? `${b.locais?.nome ?? "—"}${b.distancia_m != null ? ` · ${Math.round(b.distancia_m)} m do centro` : ""}`}
                  </span>
                </span>
                <SeloStatus status={b.status} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </div>
  );
}
