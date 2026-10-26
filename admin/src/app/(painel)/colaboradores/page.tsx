"use client";

import { useCallback, useEffect, useState } from "react";
import { useUsuario } from "@/components/Sessao";
import { Avatar } from "@/components/ui";
import { gerenciarColaborador, supabase } from "@/lib/supabase";
import type { Escala, Local, Papel, Usuario } from "@/lib/tipos";

type DiaJornada = { ativo: boolean; entrada: string; saida: string; intervalo: number };
const nomesDias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// padrão para quem ainda não tem escala: segunda a sexta, 8h às 17h, 1 h de intervalo
const jornadaPadrao = (): DiaJornada[] =>
  nomesDias.map((_, i) => ({ ativo: i >= 1 && i <= 5, entrada: "08:00", saida: "17:00", intervalo: 60 }));

function minutosJornada(d: DiaJornada) {
  const [eh, em] = d.entrada.split(":").map(Number);
  const [sh, sm] = d.saida.split(":").map(Number);
  let min = sh * 60 + sm - (eh * 60 + em);
  if (min <= 0) min += 1440;
  return Math.max(0, min - d.intervalo);
}

type Vinculo = { usuario_id: string; local_id: string };

const vazio = { nome: "", email: "", senha: "", cpf: "", pis: "", cargo: "", papel: "colaborador" as Papel };

export default function PaginaColaboradores() {
  const eu = useUsuario();
  const souAdmin = eu.papel === "admin";
  const [pessoas, setPessoas] = useState<Usuario[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [jornada, setJornada] = useState<DiaJornada[]>(jornadaPadrao());
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  const [form, setForm] = useState(vazio);
  const [locaisForm, setLocaisForm] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const carregar = useCallback(async () => {
    const [p, l, v, e] = await Promise.all([
      supabase.from("usuarios").select("*").order("nome"),
      supabase.from("locais").select("*").eq("ativo", true).order("nome"),
      supabase.from("usuario_locais").select("*"),
      supabase.from("escalas").select("*"),
    ]);
    setEscalas((e.data as Escala[]) ?? []);
    setPessoas((p.data as Usuario[]) ?? []);
    setLocais((l.data as Local[]) ?? []);
    setVinculos((v.data as Vinculo[]) ?? []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrir(u: Usuario | "novo") {
    setErro(null);
    setEditando(u);
    if (u === "novo") {
      setForm(vazio);
      setLocaisForm([]);
      setJornada(jornadaPadrao());
    } else {
      setForm({ nome: u.nome, email: u.email ?? "", senha: "", cpf: u.cpf ?? "", pis: u.pis ?? "", cargo: u.cargo ?? "", papel: u.papel });
      setLocaisForm(vinculos.filter((v) => v.usuario_id === u.id).map((v) => v.local_id));
      const dele = escalas.filter((e) => e.usuario_id === u.id);
      setJornada(dele.length === 0 ? jornadaPadrao() : nomesDias.map((_, i) => {
        const e = dele.find((x) => x.dia_semana === i);
        return e
          ? { ativo: true, entrada: e.entrada.slice(0, 5), saida: e.saida.slice(0, 5), intervalo: e.intervalo_min }
          : { ativo: false, entrada: "08:00", saida: "17:00", intervalo: 60 };
      }));
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      let id: string;
      if (editando === "novo") {
        id = (await gerenciarColaborador({ acao: "criar", ...form, locais: locaisForm })).id;
      } else if (editando) {
        id = editando.id;
        const { error } = await supabase.from("usuarios")
          .update({ nome: form.nome, cpf: form.cpf || null, pis: form.pis || null, cargo: form.cargo || null, papel: form.papel })
          .eq("id", editando.id);
        if (error) throw new Error(error.message);
        if (form.senha) await gerenciarColaborador({ acao: "senha", usuario_id: editando.id, senha: form.senha });
        const atuais = vinculos.filter((v) => v.usuario_id === editando.id).map((v) => v.local_id);
        const remover = atuais.filter((id) => !locaisForm.includes(id));
        const adicionar = locaisForm.filter((id) => !atuais.includes(id));
        if (remover.length) await supabase.from("usuario_locais").delete().eq("usuario_id", editando.id).in("local_id", remover);
        if (adicionar.length) await supabase.from("usuario_locais").insert(adicionar.map((local_id) => ({ usuario_id: editando.id, local_id })));
      } else return;
      // jornada: troca a escala inteira da semana
      const { error: erroApagar } = await supabase.from("escalas").delete().eq("usuario_id", id);
      if (erroApagar) throw new Error(erroApagar.message);
      const dias = jornada.flatMap((d, i) => d.ativo ? [{ usuario_id: id, dia_semana: i, entrada: d.entrada, saida: d.saida, intervalo_min: d.intervalo }] : []);
      if (dias.length) {
        const { error: erroEscala } = await supabase.from("escalas").insert(dias);
        if (erroEscala) throw new Error(erroEscala.message);
      }
      setEditando(null);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(u: Usuario) {
    if (!confirm(u.ativo ? `Desativar ${u.nome}? A pessoa não conseguirá mais entrar no app.` : `Reativar ${u.nome}?`)) return;
    try {
      await gerenciarColaborador({ acao: "ativo", usuario_id: u.id, ativo: !u.ativo });
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const lista = pessoas.filter((p) => mostrarInativos || p.ativo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="titulo">Colaboradores</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-suave">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos
          </label>
          {souAdmin && <button className="botao" onClick={() => abrir("novo")}>Novo colaborador</button>}
        </div>
      </div>

      {editando && (
        <form onSubmit={salvar} className="cartao grid gap-4 p-6 animate-entrar md:grid-cols-3">
          <h2 className="font-medium md:col-span-3">{editando === "novo" ? "Novo colaborador" : `Editar ${editando.nome}`}</h2>
          <label className="text-sm">Nome<input className="campo mt-1" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
          <label className="text-sm">E-mail (login)<input className="campo mt-1" type="email" required disabled={editando !== "novo"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="text-sm">{editando === "novo" ? "Senha inicial" : "Nova senha (opcional)"}
            <input className="campo mt-1" type="text" minLength={6} required={editando === "novo"} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
          </label>
          <label className="text-sm">CPF<input className="campo mt-1" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, "") })} maxLength={11} /></label>
          <label className="text-sm">PIS<input className="campo mt-1" value={form.pis} onChange={(e) => setForm({ ...form, pis: e.target.value.replace(/\D/g, "") })} maxLength={11} /></label>
          <label className="text-sm">Cargo<input className="campo mt-1" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></label>
          <label className="text-sm">Perfil
            <select className="campo mt-1" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value as Papel })}>
              <option value="colaborador">Colaborador (usa o app)</option>
              <option value="gestor">Gestor (vê o painel)</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <fieldset className="text-sm md:col-span-2">
            <legend>Locais onde pode bater ponto</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {locais.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={locaisForm.includes(l.id)}
                    onChange={(e) => setLocaisForm(e.target.checked ? [...locaisForm, l.id] : locaisForm.filter((id) => id !== l.id))} />
                  {l.nome}
                </label>
              ))}
              {locais.length === 0 && <span className="text-suave">Cadastre um local primeiro.</span>}
            </div>
          </fieldset>
          <fieldset className="text-sm md:col-span-3">
            <legend className="flex w-full items-center justify-between">
              <span>Jornada de trabalho</span>
              <span className="text-xs text-suave">
                {Math.floor(jornada.filter((d) => d.ativo).reduce((t, d) => t + minutosJornada(d), 0) / 60)} h por semana
              </span>
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {jornada.map((d, i) => {
                const mudar = (novo: Partial<DiaJornada>) => setJornada(jornada.map((x, j) => (j === i ? { ...x, ...novo } : x)));
                return (
                  <div key={i} className={`rounded-xl border p-3 transition ${d.ativo ? "border-tinta" : "border-linha opacity-60"}`}>
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" checked={d.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
                      {nomesDias[i]}
                      <span className="ml-auto text-xs font-normal text-suave">{d.ativo ? `${(minutosJornada(d) / 60).toFixed(1).replace(".0", "")} h` : "Folga"}</span>
                    </label>
                    {d.ativo && (
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <input aria-label="Entrada" type="time" className="campo px-2 py-1.5 text-xs" value={d.entrada} onChange={(e) => mudar({ entrada: e.target.value })} />
                        <input aria-label="Saída" type="time" className="campo px-2 py-1.5 text-xs" value={d.saida} onChange={(e) => mudar({ saida: e.target.value })} />
                        <select aria-label="Intervalo" className="campo col-span-2 px-2 py-1.5 text-xs" value={d.intervalo} onChange={(e) => mudar({ intervalo: Number(e.target.value) })}>
                          {[0, 15, 30, 60, 90, 120].map((m) => <option key={m} value={m}>{m ? `Intervalo de ${m} min` : "Sem intervalo"}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-suave">Entrada, saída e intervalo de cada dia. É a base do cálculo de horas extras e faltas no espelho de ponto.</p>
          </fieldset>
          {erro && <p className="text-sm text-perigo md:col-span-3">{erro}</p>}
          <div className="flex gap-2 md:col-span-3">
            <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="botao-sec" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="cartao overflow-x-auto animate-entrar [animation-delay:120ms]">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Perfil</th><th>Locais</th><th></th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className={u.ativo ? "" : "text-neutral-400 opacity-70"}>
                <td className="cheio">
                  <span className="flex items-center gap-3">
                    <Avatar nome={u.nome} escuro={u.ativo} tamanho="h-8 w-8" />
                    <span className="font-medium">{u.nome}{!u.ativo && <span className="ml-1 font-normal text-suave">(inativo)</span>}</span>
                  </span>
                </td>
                <td data-rotulo="E-mail" className="cheio">{u.email}</td>
                <td data-rotulo="Cargo">{u.cargo ?? "—"}</td>
                <td data-rotulo="Perfil"><span className={`selo capitalize ${u.papel === "colaborador" ? "bg-neutral-100" : "bg-tinta text-white"}`}>{u.papel}</span></td>
                <td data-rotulo="Locais" className="cheio">{vinculos.filter((v) => v.usuario_id === u.id).map((v) => locais.find((l) => l.id === v.local_id)?.nome).filter(Boolean).join(", ") || "—"}</td>
                <td className="acoes whitespace-nowrap text-right">
                  {souAdmin && (
                    <>
                      <button className="font-medium text-tinta underline-offset-4 hover:underline" onClick={() => abrir(u)}>Editar</button>
                      {u.id !== eu.id && (
                        <button className="ml-3 text-suave underline-offset-4 hover:text-tinta hover:underline" onClick={() => alternarAtivo(u)}>{u.ativo ? "Desativar" : "Reativar"}</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
