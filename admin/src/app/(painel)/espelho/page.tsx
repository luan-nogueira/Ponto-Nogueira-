"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Printer, Trash2 } from "lucide-react";
import { useEmpresa, useUsuario } from "@/components/Sessao";
import { Avatar, Cabecalho, LinhasEsqueleto, Vazio } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { diaCurto, feriadosNacionais, horas, limitesDoMes, nomeDoMes } from "@/lib/formato";
import type { DiaEspelho, Empresa, Feriado, SituacaoDia, Usuario } from "@/lib/tipos";

const nomeSituacao: Record<SituacaoDia, string> = {
  normal: "Normal",
  falta: "Falta",
  folga: "Folga",
  feriado: "Feriado",
  incompleto: "Incompleto",
  em_revisao: "Em revisão",
  em_andamento: "Em andamento",
  futuro: "",
};

const estiloSituacao: Record<SituacaoDia, string> = {
  normal: "bg-neutral-100 text-tinta",
  falta: "bg-red-50 text-perigo",
  folga: "text-suave",
  feriado: "text-suave",
  incompleto: "border border-tinta text-tinta",
  em_revisao: "border border-neutral-300 text-suave",
  em_andamento: "bg-tinta text-white",
  futuro: "",
};

type Totais = ReturnType<typeof somar>;

function somar(dias: DiaEspelho[]) {
  const t = { previsto: 0, trabalhado: 0, extra50: 0, extra100: 0, falta: 0, noturno: 0, atraso: 0, diasFalta: 0, incompletos: 0, saldo: 0 };
  for (const d of dias) {
    t.previsto += d.previsto_min;
    t.trabalhado += d.trabalhado_min;
    t.extra50 += d.extra50_min;
    t.extra100 += d.extra100_min;
    t.falta += d.falta_min;
    t.noturno += d.noturno_min;
    t.atraso += d.atraso_min;
    if (d.situacao === "falta") t.diasFalta++;
    if (d.situacao === "incompleto") t.incompletos++;
  }
  t.saldo = t.extra50 + t.extra100 - t.falta;
  return t;
}

function mesAtual() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function mudarMes(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default function PaginaEspelho() {
  const { empresa } = useEmpresa();
  const [mes, setMes] = useState(mesAtual());
  const [colaborador, setColaborador] = useState("");
  const [pessoas, setPessoas] = useState<Usuario[]>([]);
  // guarda junto a consulta que gerou os dados, para não mostrar o mês ou a pessoa anterior durante a troca
  const [resultado, setResultado] = useState<{ chave: string; dias: DiaEspelho[] } | null>(null);
  const chave = `${mes}|${colaborador}`;
  const dias = resultado?.chave === chave ? resultado.dias : null;
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("usuarios").select("*").order("nome").then(({ data }) => setPessoas((data as Usuario[]) ?? []));
  }, []);

  const carregar = useCallback(async () => {
    setErro(null);
    const [inicio, fim] = limitesDoMes(mes);
    const { data, error } = await supabase.rpc("espelho_ponto", { p_inicio: inicio, p_fim: fim, p_usuario: colaborador || null });
    if (error) setErro(error.message);
    setResultado({ chave: `${mes}|${colaborador}`, dias: (data as DiaEspelho[]) ?? [] });
  }, [mes, colaborador]);

  useEffect(() => { carregar(); }, [carregar]);

  // dias agrupados por colaborador, na ordem que vieram (por nome)
  const grupos = useMemo(() => {
    const mapa = new Map<string, DiaEspelho[]>();
    for (const d of dias ?? []) mapa.set(d.usuario_id, [...(mapa.get(d.usuario_id) ?? []), d]);
    return [...mapa.entries()].map(([id, lista]) => ({ id, nome: lista[0].nome, dias: lista, totais: somar(lista) }));
  }, [dias]);

  const geral = useMemo(() => somar(dias ?? []), [dias]);

  function exportarCSV() {
    const linhas = [["Colaborador", "Data", "Marcações", "Previsto", "Trabalhado", "Extra 50%", "Extra 100%", "Falta", "Adicional noturno", "Situação"]];
    for (const d of dias ?? []) {
      if (d.situacao === "futuro") continue;
      linhas.push([
        d.nome, d.data.split("-").reverse().join("/"), d.marcacoes.map((m) => m.hora).join(" "),
        horas(d.previsto_min), horas(d.trabalhado_min), horas(d.extra50_min), horas(d.extra100_min),
        horas(d.falta_min), horas(d.noturno_min), nomeSituacao[d.situacao],
      ]);
    }
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `espelho_${mes}${colaborador ? "_" + (pessoas.find((p) => p.id === colaborador)?.nome ?? "") : ""}.csv`;
    a.click();
  }

  const pessoaSelecionada = pessoas.find((p) => p.id === colaborador);

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="print:hidden">
        <Cabecalho titulo="Espelho de ponto" subtitulo="Horas trabalhadas, extras, faltas e adicional noturno do mês">
          <button className="botao-sec" onClick={exportarCSV} disabled={!dias?.length}><Download size={16} /> CSV</button>
          <button className="botao" onClick={() => window.print()} disabled={!dias?.length}><Printer size={16} /> Imprimir ou PDF</button>
        </Cabecalho>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4 animate-entrar print:hidden">
        <div>
          <span className="rotulo">Mês</span>
          <div className="mt-1.5 flex items-center gap-1">
            <button className="botao-sec px-2.5" onClick={() => setMes(mudarMes(mes, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <input type="month" className="campo w-44" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
            <button className="botao-sec px-2.5" onClick={() => setMes(mudarMes(mes, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
        </div>
        <label className="min-w-56 flex-1 md:flex-none">
          <span className="rotulo">Colaborador</span>
          <select className="campo mt-1.5" value={colaborador} onChange={(e) => setColaborador(e.target.value)}>
            <option value="">Toda a equipe (resumo)</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      </div>

      {erro && <p className="text-sm text-perigo print:hidden">{erro}</p>}

      <CartoesTotais totais={geral} carregando={dias === null} />

      {colaborador === "" ? (
        <>
          <ResumoEquipe grupos={grupos} carregando={dias === null} aoAbrir={setColaborador} />
          {/* na impressão do resumo sai um espelho por colaborador, cada um em uma folha */}
          <div className="hidden print:block">
            {grupos.map((g) => (
              <Folha key={g.id} empresa={empresa} pessoa={pessoas.find((p) => p.id === g.id)} nome={g.nome} mes={mes} dias={g.dias} totais={g.totais} />
            ))}
          </div>
        </>
      ) : (
        <Folha
          empresa={empresa}
          pessoa={pessoaSelecionada}
          nome={pessoaSelecionada?.nome ?? ""}
          mes={mes}
          dias={dias}
          totais={geral}
        />
      )}

      <Feriados ano={Number(mes.slice(0, 4))} aoMudar={carregar} />
    </div>
  );
}

function CartoesTotais({ totais, carregando }: { totais: Totais; carregando: boolean }) {
  const cartoes = [
    { titulo: "Horas trabalhadas", valor: horas(totais.trabalhado), detalhe: `de ${horas(totais.previsto)} previstas`, escuro: true },
    { titulo: "Extras 50%", valor: horas(totais.extra50), detalhe: "dias úteis" },
    { titulo: "Extras 100%", valor: horas(totais.extra100), detalhe: "domingos e feriados" },
    { titulo: "Faltas e atrasos", valor: horas(totais.falta), detalhe: `${totais.diasFalta} ${totais.diasFalta === 1 ? "dia" : "dias"} de falta`, alerta: totais.falta > 0 },
    { titulo: "Adicional noturno", valor: horas(totais.noturno), detalhe: "entre 22h e 5h" },
    { titulo: "Saldo do mês", valor: (totais.saldo > 0 ? "+" : "") + horas(totais.saldo), detalhe: "banco de horas", alerta: totais.saldo < 0 },
  ];
  return (
    <div className="escalonado grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 print:hidden">
      {cartoes.map((c) => (
        <div key={c.titulo} className={`cartao cartao-vivo p-4 ${c.escuro ? "border-tinta bg-tinta text-white" : ""}`}>
          <span className={`rotulo ${c.escuro ? "text-neutral-400" : ""}`}>{c.titulo}</span>
          {carregando ? (
            <div className="esqueleto mt-3 h-8 w-20" />
          ) : (
            <div className={`mt-2 text-3xl font-medium tabular-nums tracking-tight ${c.alerta ? "text-perigo" : ""}`}>{c.valor}</div>
          )}
          <div className={`mt-1 text-xs ${c.escuro ? "text-neutral-400" : "text-suave"}`}>{c.detalhe}</div>
        </div>
      ))}
    </div>
  );
}

function ResumoEquipe({ grupos, carregando, aoAbrir }: {
  grupos: { id: string; nome: string; totais: Totais }[];
  carregando: boolean;
  aoAbrir: (id: string) => void;
}) {
  return (
    <div className="cartao overflow-x-auto animate-entrar [animation-delay:120ms] print:hidden">
      <table className="tabela">
        <thead>
          <tr><th>Colaborador</th><th>Trabalhadas</th><th>Extras 50%</th><th>Extras 100%</th><th>Faltas</th><th>Noturno</th><th>Saldo</th><th></th></tr>
        </thead>
        <tbody>
          {carregando && <LinhasEsqueleto colunas={8} />}
          {!carregando && grupos.length === 0 && <Vazio colunas={8} texto="Nenhum colaborador no período." />}
          {grupos.map((g) => (
            <tr key={g.id} className="cursor-pointer" onClick={() => aoAbrir(g.id)}>
              <td className="cheio">
                <span className="flex items-center gap-3"><Avatar nome={g.nome} tamanho="h-8 w-8" /><span className="font-medium">{g.nome}</span></span>
              </td>
              <td data-rotulo="Trabalhadas" className="tabular-nums">{horas(g.totais.trabalhado)}</td>
              <td data-rotulo="Extras 50%" className="tabular-nums">{horas(g.totais.extra50, true)}</td>
              <td data-rotulo="Extras 100%" className="tabular-nums">{horas(g.totais.extra100, true)}</td>
              <td data-rotulo="Faltas" className={`tabular-nums ${g.totais.falta ? "text-perigo" : ""}`}>
                {horas(g.totais.falta, true)}
                {g.totais.diasFalta > 0 && <span className="ml-1 text-xs text-suave">({g.totais.diasFalta}d)</span>}
              </td>
              <td data-rotulo="Noturno" className="tabular-nums">{horas(g.totais.noturno, true)}</td>
              <td data-rotulo="Saldo" className={`font-medium tabular-nums ${g.totais.saldo < 0 ? "text-perigo" : ""}`}>
                {(g.totais.saldo > 0 ? "+" : "") + horas(g.totais.saldo)}
              </td>
              <td className="acoes text-right">
                <button className="font-medium text-tinta underline-offset-4 hover:underline">Ver espelho</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Espelho de um colaborador: aparece na tela e sai assim na impressão, com campos de assinatura. */
function Folha({ empresa, pessoa, nome, mes, dias, totais }: {
  empresa: Empresa;
  pessoa?: Usuario;
  nome: string;
  mes: string;
  dias: DiaEspelho[] | null;
  totais: Totais;
}) {
  return (
    <section className="folha cartao overflow-hidden animate-entrar [animation-delay:120ms]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-linha p-5">
        <div className="flex items-center gap-3">
          {empresa.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logo_url} alt="" className="h-12 w-12 rounded-lg bg-[#fff] object-contain p-1" />
          )}
          <div>
            <div className="font-semibold">{empresa.nome}</div>
            {empresa.cnpj && <div className="text-xs text-suave">CNPJ {empresa.cnpj}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="rotulo">Espelho de ponto</div>
          <div className="font-semibold">{nomeDoMes(mes)}</div>
        </div>
        <div className="grid w-full grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <Campo rotulo="Colaborador" valor={nome} />
          <Campo rotulo="Cargo" valor={pessoa?.cargo} />
          <Campo rotulo="CPF" valor={pessoa?.cpf} />
          <Campo rotulo="PIS" valor={pessoa?.pis} />
        </div>
      </header>

      {dias && dias.length > 0 && dias.every((d) => d.previsto_min === 0) && (
        <p className="border-b border-linha bg-neutral-50 px-5 py-3 text-sm print:hidden">
          {nome} ainda não tem jornada cadastrada, então todas as horas contam como extra. Cadastre em <b>Colaboradores → Editar → Jornada de trabalho</b>.
        </p>
      )}

      {/* celular: lista compacta, um dia por linha */}
      <ul className="divide-y divide-linha md:hidden print:hidden">
        {dias === null && Array.from({ length: 6 }).map((_, i) => <li key={i} className="px-4 py-3"><div className="esqueleto h-5 w-full" /></li>)}
        {dias?.map((d) => <DiaCelular key={d.data} d={d} />)}
      </ul>
      {dias && dias.length > 0 && (
        <div className="grid grid-cols-3 gap-3 border-t border-linha px-4 py-3 text-center text-xs md:hidden print:hidden">
          <div><div className="rotulo">Trabalhado</div><div className="mt-0.5 text-base font-medium tabular-nums">{horas(totais.trabalhado)}</div></div>
          <div><div className="rotulo">Extras</div><div className="mt-0.5 text-base font-medium tabular-nums">{horas(totais.extra50 + totais.extra100)}</div></div>
          <div><div className="rotulo">Saldo</div><div className={`mt-0.5 text-base font-medium tabular-nums ${totais.saldo < 0 ? "text-perigo" : ""}`}>{(totais.saldo > 0 ? "+" : "") + horas(totais.saldo)}</div></div>
        </div>
      )}

      <div className="hidden overflow-x-auto md:block print:block">
        <table className="tabela tabela-espelho">
          <thead>
            <tr><th>Dia</th><th>Marcações</th><th>Previsto</th><th>Trabalhado</th><th>Extras</th><th>Faltas</th><th>Noturno</th><th>Situação</th></tr>
          </thead>
          <tbody>
            {dias === null && <LinhasEsqueleto colunas={8} linhas={8} />}
            {dias?.map((d) => {
              const { dia, semana } = diaCurto(d.data);
              const apagado = d.situacao === "folga" || d.situacao === "feriado" || d.situacao === "futuro";
              const extra = d.extra50_min + d.extra100_min;
              return (
                <tr key={d.data} className={apagado ? "text-neutral-400" : ""}>
                  <td className="cheio md:whitespace-nowrap">
                    <span className="font-medium tabular-nums">{dia}</span> <span className="text-xs uppercase text-suave">{semana}</span>
                  </td>
                  <td data-rotulo="Marcações" className="cheio">
                    <Marcas d={d} />
                  </td>
                  <td data-rotulo="Previsto" className="tabular-nums">{horas(d.previsto_min, true)}</td>
                  <td data-rotulo="Trabalhado" className="tabular-nums">{horas(d.trabalhado_min, true)}</td>
                  <td data-rotulo="Extras" className="tabular-nums">
                    {horas(extra, true)}
                    {d.extra100_min > 0 && <span className="ml-1 text-[10px] text-suave">100%</span>}
                  </td>
                  <td data-rotulo="Faltas" className={`tabular-nums ${d.falta_min ? "text-perigo" : ""}`}>
                    {horas(d.falta_min, true)}
                    {d.atraso_min > 0 && <span className="block text-[10px] text-suave print:ml-1 print:inline">atraso {horas(d.atraso_min)}</span>}
                  </td>
                  <td data-rotulo="Noturno" className="tabular-nums">{horas(d.noturno_min, true)}</td>
                  <td data-rotulo="Situação">
                    {nomeSituacao[d.situacao] && <span className={`selo ${estiloSituacao[d.situacao]}`}>{nomeSituacao[d.situacao]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {dias && dias.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={2}>Total do mês</td>
                <td className="tabular-nums">{horas(totais.previsto)}</td>
                <td className="tabular-nums">{horas(totais.trabalhado)}</td>
                <td className="tabular-nums">
                  {horas(totais.extra50 + totais.extra100)}
                  {totais.extra100 > 0 && <span className="block text-[10px] font-normal text-suave">{horas(totais.extra100)} a 100%</span>}
                </td>
                <td className="tabular-nums">{horas(totais.falta)}</td>
                <td className="tabular-nums">{horas(totais.noturno)}</td>
                <td className="tabular-nums">Saldo {(totais.saldo > 0 ? "+" : "") + horas(totais.saldo)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <footer className="space-y-1 border-t border-linha px-5 py-3 text-xs text-suave">
        <p>* marcação incluída ou corrigida por ajuste aprovado · ? batida aguardando revisão</p>
        <p>Variações de até 10 minutos no dia não geram extra nem desconto (CLT, art. 58 §1º). Adicional noturno em minutos de relógio.</p>
      </footer>

      <div className="hidden grid-cols-2 gap-16 px-5 pt-10 text-center text-xs print:grid">
        <div className="border-t border-tinta pt-1">{nome}<br />Colaborador</div>
        <div className="border-t border-tinta pt-1">{empresa.nome}<br />Responsável</div>
      </div>
    </section>
  );
}

function Marcas({ d }: { d: DiaEspelho }) {
  return (
    <span className="marcas flex flex-wrap gap-1">
      {d.marcacoes.map((m, i) => (
        <span
          key={i}
          title={m.origem === "ajuste" ? "Ajustada pelo gestor" : m.origem === "pendente_revisao" ? "Em revisão" : undefined}
          className={`rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums ${
            m.origem === "valida" ? "bg-neutral-100" : "border border-dashed border-neutral-400"
          }`}
        >
          {m.hora}{m.origem === "ajuste" ? "*" : m.origem === "pendente_revisao" ? "?" : ""}
        </span>
      ))}
      {d.marcacoes.length === 0 && <span className="text-suave">—</span>}
    </span>
  );
}

function DiaCelular({ d }: { d: DiaEspelho }) {
  const { dia, semana } = diaCurto(d.data);
  const apagado = d.situacao === "folga" || d.situacao === "feriado" || d.situacao === "futuro";
  const extra = d.extra50_min + d.extra100_min;
  const resumo = [
    d.trabalhado_min > 0 && `${horas(d.trabalhado_min)} trabalhadas`,
    extra > 0 && `+${horas(extra)} extra${d.extra100_min > 0 ? " 100%" : ""}`,
    d.atraso_min > 0 && `atraso ${horas(d.atraso_min)}`,
    d.falta_min > 0 && d.situacao !== "falta" && `-${horas(d.falta_min)}`,
    d.noturno_min > 0 && `${horas(d.noturno_min)} noturno`,
  ].filter(Boolean);
  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 ${apagado ? "opacity-50" : ""}`}>
      <div className="w-11 shrink-0 leading-tight">
        <div className="text-sm font-medium tabular-nums">{dia}</div>
        <div className="text-[10px] uppercase text-suave">{semana}</div>
      </div>
      <div className="min-w-0 flex-1">
        {d.marcacoes.length > 0 ? <Marcas d={d} /> : <span className="text-sm text-suave">{apagado ? "—" : "Sem marcação"}</span>}
        {resumo.length > 0 && <div className="mt-1 text-[11px] text-suave">{resumo.join(" · ")}</div>}
      </div>
      {nomeSituacao[d.situacao] && d.situacao !== "normal" && (
        <span className={`selo shrink-0 ${estiloSituacao[d.situacao]}`}>{nomeSituacao[d.situacao]}</span>
      )}
    </li>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="min-w-0">
      <span className="text-[10px] uppercase tracking-[0.1em] text-suave">{rotulo}</span>
      <div className="truncate">{valor || "—"}</div>
    </div>
  );
}

function Feriados({ ano, aoMudar }: { ano: number; aoMudar: () => void }) {
  const { empresa } = useEmpresa();
  const eu = useUsuario();
  const [lista, setLista] = useState<Feriado[]>([]);
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("feriados").select("id, data, nome")
      .gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`).order("data");
    setLista((data as Feriado[]) ?? []);
  }, [ano]);

  useEffect(() => { carregar(); }, [carregar]);

  async function depois() {
    await carregar();
    aoMudar();
    setOcupado(false);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !nome) return;
    setOcupado(true);
    const { error } = await supabase.from("feriados").insert({ empresa_id: empresa.id, data, nome });
    if (error) alert(error.code === "23505" ? "Já existe um feriado nesse dia." : error.message);
    setData("");
    setNome("");
    depois();
  }

  async function nacionais() {
    setOcupado(true);
    await supabase.from("feriados").upsert(
      feriadosNacionais(ano).map((f) => ({ ...f, empresa_id: empresa.id })),
      { onConflict: "empresa_id,data", ignoreDuplicates: true },
    );
    depois();
  }

  async function remover(f: Feriado) {
    if (!confirm(`Remover o feriado ${f.nome}?`)) return;
    setOcupado(true);
    await supabase.from("feriados").delete().eq("id", f.id);
    depois();
  }

  return (
    <div className="cartao animate-entrar [animation-delay:200ms] print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-5 py-4">
        <div>
          <h2 className="font-semibold">Feriados de {ano}</h2>
          <p className="text-xs text-suave">Dias sem jornada prevista. Quem trabalha neles recebe extra 100%.</p>
        </div>
        {eu.papel !== "colaborador" && (
          <button className="botao-sec" onClick={nacionais} disabled={ocupado}><CalendarPlus size={16} /> Adicionar feriados nacionais</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 p-5">
        {lista.length === 0 && <p className="text-sm text-suave">Nenhum feriado cadastrado para {ano}.</p>}
        {lista.map((f) => (
          <span key={f.id} className="group inline-flex items-center gap-2 rounded-full border border-linha py-1 pl-3 pr-1.5 text-sm">
            <span className="font-mono text-xs tabular-nums text-suave">{f.data.slice(8, 10)}/{f.data.slice(5, 7)}</span>
            {f.nome}
            <button className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-perigo" onClick={() => remover(f)} aria-label={`Remover ${f.nome}`}>
              <Trash2 size={13} />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2 border-t border-linha px-5 py-4">
        <label className="text-sm"><span className="rotulo">Data</span><input type="date" className="campo mt-1.5" value={data} onChange={(e) => setData(e.target.value)} required /></label>
        <label className="min-w-48 flex-1 text-sm"><span className="rotulo">Nome</span><input className="campo mt-1.5" placeholder="Ex.: Aniversário da cidade" value={nome} onChange={(e) => setNome(e.target.value)} required /></label>
        <button className="botao" disabled={ocupado}>Adicionar</button>
      </form>
    </div>
  );
}
