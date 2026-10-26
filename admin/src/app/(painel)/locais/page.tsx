"use client";

import { useCallback, useEffect, useState } from "react";
import Mapa from "@/components/Mapa";
import { useUsuario } from "@/components/Sessao";
import { supabase } from "@/lib/supabase";
import type { Local } from "@/lib/tipos";

type Form = { nome: string; endereco: string; lat: number | null; lng: number | null; raio_metros: number };
const vazio: Form = { nome: "", endereco: "", lat: null, lng: null, raio_metros: 150 };

export default function PaginaLocais() {
  const eu = useUsuario();
  const [locais, setLocais] = useState<Local[]>([]);
  const [editando, setEditando] = useState<Local | "novo" | null>(null);
  const [form, setForm] = useState<Form>(vazio);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("locais").select("*").order("nome");
    setLocais((data as Local[]) ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrir(l: Local | "novo") {
    setErro(null);
    setResultados([]);
    setBusca("");
    setEditando(l);
    setForm(l === "novo" ? vazio : { nome: l.nome, endereco: l.endereco ?? "", lat: l.lat, lng: l.lng, raio_metros: l.raio_metros });
  }

  // Busca de endereço gratuita (OpenStreetMap). Para uso intenso, trocar por Google Places.
  async function buscarEndereco() {
    if (!busca.trim()) return;
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=5&q=${encodeURIComponent(busca)}`);
    setResultados(await r.json());
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (form.lat == null || form.lng == null) {
      setErro("Clique no mapa para marcar o local");
      return;
    }
    const dados = { nome: form.nome, endereco: form.endereco || null, lat: form.lat, lng: form.lng, raio_metros: form.raio_metros };
    const { error } = editando === "novo"
      ? await supabase.from("locais").insert({ ...dados, empresa_id: eu.empresa_id })
      : await supabase.from("locais").update(dados).eq("id", (editando as Local).id);
    if (error) {
      setErro(error.message);
      return;
    }
    setEditando(null);
    carregar();
  }

  async function alternarAtivo(l: Local) {
    await supabase.from("locais").update({ ativo: !l.ativo }).eq("id", l.id);
    carregar();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="titulo">Locais de trabalho</h1>
        <button className="botao" onClick={() => abrir("novo")}>Novo local</button>
      </div>

      {editando && (
        <form onSubmit={salvar} className="cartao grid gap-6 p-6 animate-entrar lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <h2 className="font-medium">{editando === "novo" ? "Novo local" : `Editar ${editando.nome}`}</h2>
            <label className="block text-sm">Nome<input className="campo mt-1" required placeholder="Ex.: Atacadão Marginal" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
            <div className="text-sm">
              Buscar endereço
              <div className="mt-1 flex gap-2">
                <input className="campo" value={busca} onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarEndereco(); } }} />
                <button type="button" className="botao-sec" onClick={buscarEndereco}>Buscar</button>
              </div>
              {resultados.map((r) => (
                <button type="button" key={r.display_name} className="mt-1 block w-full rounded px-2 py-1 text-left text-xs hover:bg-neutral-100"
                  onClick={() => { setForm({ ...form, endereco: r.display_name, lat: +r.lat, lng: +r.lon }); setResultados([]); }}>
                  {r.display_name}
                </button>
              ))}
            </div>
            <label className="block text-sm">Endereço<input className="campo mt-1" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></label>
            <label className="block text-sm">
              Raio permitido: <b className="font-mono">{form.raio_metros} m</b>
              <input type="range" min={30} max={1000} step={10} className="mt-1 w-full" value={form.raio_metros}
                onChange={(e) => setForm({ ...form, raio_metros: +e.target.value })} />
              <span className="text-xs text-suave">Inclua o estacionamento se o funcionário pode bater ponto lá. GPS de celular erra de 10 a 30 m.</span>
            </label>
            <p className="text-xs text-suave">
              {form.lat != null ? `Centro: ${form.lat.toFixed(6)}, ${form.lng!.toFixed(6)}. Clique no mapa para ajustar.` : "Clique no mapa no ponto central do local."}
            </p>
            {erro && <p className="text-sm text-perigo">{erro}</p>}
            <div className="flex gap-2">
              <button className="botao">Salvar</button>
              <button type="button" className="botao-sec" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </div>
          <Mapa
            className="h-[420px] w-full rounded-lg"
            ajustar={false}
            centro={form.lat != null ? [form.lat, form.lng!] : undefined}
            aoClicar={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
            cercas={form.lat != null ? [{ id: "novo", lat: form.lat, lng: form.lng!, raio: form.raio_metros, nome: form.nome || "Novo local" }] : []}
          />
        </form>
      )}

      <div className="cartao overflow-hidden p-1.5 animate-entrar [animation-delay:60ms]">
        <Mapa className="h-80 w-full rounded-xl" cercas={locais.filter((l) => l.ativo).map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, raio: l.raio_metros, nome: l.nome }))} />
      </div>

      <div className="cartao overflow-x-auto animate-entrar [animation-delay:120ms]">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Endereço</th><th>Raio</th><th></th></tr></thead>
          <tbody>
            {locais.map((l) => (
              <tr key={l.id} className={l.ativo ? "" : "text-neutral-400"}>
                <td>{l.nome}{!l.ativo && " (inativo)"}</td>
                <td className="max-w-md">{l.endereco ?? "—"}</td>
                <td>{l.raio_metros} m</td>
                <td className="whitespace-nowrap text-right">
                  <button className="font-medium text-tinta underline-offset-4 hover:underline" onClick={() => abrir(l)}>Editar</button>
                  <button className="ml-3 text-suave underline-offset-4 hover:text-tinta hover:underline" onClick={() => alternarAtivo(l)}>{l.ativo ? "Desativar" : "Reativar"}</button>
                </td>
              </tr>
            ))}
            {locais.length === 0 && <tr><td colSpan={4} className="text-suave">Nenhum local cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
