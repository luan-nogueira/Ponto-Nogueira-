"use client";

import { useCallback, useEffect, useState } from "react";
import { useUsuario } from "@/components/Sessao";
import { Avatar } from "@/components/ui";
import { gerenciarColaborador, supabase } from "@/lib/supabase";
import type { Local, Papel, Usuario } from "@/lib/tipos";

type Vinculo = { usuario_id: string; local_id: string };

const vazio = { nome: "", email: "", senha: "", cpf: "", pis: "", cargo: "", papel: "colaborador" as Papel };

export default function PaginaColaboradores() {
  const eu = useUsuario();
  const souAdmin = eu.papel === "admin";
  const [pessoas, setPessoas] = useState<Usuario[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  const [form, setForm] = useState(vazio);
  const [locaisForm, setLocaisForm] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const carregar = useCallback(async () => {
    const [p, l, v] = await Promise.all([
      supabase.from("usuarios").select("*").order("nome"),
      supabase.from("locais").select("*").eq("ativo", true).order("nome"),
      supabase.from("usuario_locais").select("*"),
    ]);
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
    } else {
      setForm({ nome: u.nome, email: u.email ?? "", senha: "", cpf: u.cpf ?? "", pis: u.pis ?? "", cargo: u.cargo ?? "", papel: u.papel });
      setLocaisForm(vinculos.filter((v) => v.usuario_id === u.id).map((v) => v.local_id));
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (editando === "novo") {
        await gerenciarColaborador({ acao: "criar", ...form, locais: locaisForm });
      } else if (editando) {
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
                <td>
                  <span className="flex items-center gap-3">
                    <Avatar nome={u.nome} escuro={u.ativo} tamanho="h-8 w-8" />
                    <span className="font-medium">{u.nome}{!u.ativo && <span className="ml-1 font-normal text-suave">(inativo)</span>}</span>
                  </span>
                </td>
                <td>{u.email}</td>
                <td>{u.cargo ?? "—"}</td>
                <td><span className={`selo capitalize ${u.papel === "colaborador" ? "bg-neutral-100" : "bg-tinta text-white"}`}>{u.papel}</span></td>
                <td>{vinculos.filter((v) => v.usuario_id === u.id).map((v) => locais.find((l) => l.id === v.local_id)?.nome).filter(Boolean).join(", ") || "—"}</td>
                <td className="whitespace-nowrap text-right">
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
