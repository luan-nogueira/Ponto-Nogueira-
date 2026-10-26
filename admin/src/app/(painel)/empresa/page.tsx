"use client";

import { useState } from "react";
import { useEmpresa, useUsuario } from "@/components/Sessao";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/lib/tipos";

const tiposLogo = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function PaginaEmpresa() {
  const eu = useUsuario();
  const { empresa, atualizarEmpresa } = useEmpresa();
  const [nome, setNome] = useState(empresa.nome);
  const [cnpj, setCnpj] = useState(empresa.cnpj ?? "");
  const [logo, setLogo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(empresa.logo_url);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (eu.papel !== "admin") return <p className="text-gray-600">Apenas o administrador altera os dados da empresa.</p>;

  function escolherLogo(arquivo: File | undefined) {
    setMensagem(null);
    if (!arquivo) return;
    if (!tiposLogo.includes(arquivo.type)) return setMensagem({ erro: true, texto: "Use uma imagem PNG, JPG, WEBP ou SVG." });
    if (arquivo.size > 1024 * 1024) return setMensagem({ erro: true, texto: "A logo deve ter no máximo 1 MB." });
    setLogo(arquivo);
    setPrevia(URL.createObjectURL(arquivo));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMensagem(null);
    try {
      let logoUrl = empresa.logo_url;
      if (logo) {
        // nome novo a cada troca para o navegador e o app não mostrarem a logo antiga
        const extensao = logo.name.split(".").pop()?.toLowerCase() ?? "png";
        const caminho = `${empresa.id}/logo-${Date.now()}.${extensao}`;
        const { error } = await supabase.storage.from("logos").upload(caminho, logo, { contentType: logo.type });
        if (error) throw new Error(error.message);
        logoUrl = supabase.storage.from("logos").getPublicUrl(caminho).data.publicUrl;
      }
      const dados = { nome: nome.trim(), cnpj: cnpj || null, logo_url: logoUrl };
      const { error } = await supabase.from("empresas").update(dados).eq("id", empresa.id);
      if (error) throw new Error(error.message);
      atualizarEmpresa({ ...empresa, ...dados } as Empresa);
      setLogo(null);
      setMensagem({ erro: false, texto: "Dados da empresa salvos." });
    } catch (err) {
      setMensagem({ erro: true, texto: (err as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Empresa</h1>
      <form onSubmit={salvar} className="cartao grid max-w-3xl gap-6 p-4 md:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white">
            {previa ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previa} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="px-4 text-center text-xs text-gray-500">Sem logo</span>
            )}
          </div>
          <label className="botao-sec w-48 cursor-pointer">
            Escolher logo
            <input type="file" accept={tiposLogo.join(",")} className="hidden" onChange={(e) => escolherLogo(e.target.files?.[0])} />
          </label>
          <p className="w-48 text-xs text-gray-500">Aparece no painel e no app dos colaboradores. PNG com fundo branco ou transparente, até 1 MB.</p>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">Nome da empresa<input className="campo mt-1" required value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="block text-sm">CNPJ
            <input className="campo mt-1" value={cnpj} maxLength={14} onChange={(e) => setCnpj(e.target.value.replace(/\D/g, ""))} />
            <span className="text-xs text-gray-500">Sai no comprovante de cada batida.</span>
          </label>
          {mensagem && <p className={`text-sm ${mensagem.erro ? "text-red-700" : "text-emerald-700"}`}>{mensagem.texto}</p>}
          <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}
