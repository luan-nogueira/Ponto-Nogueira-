"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Download, FileText, Paperclip, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dataBR, tamanhoArquivo } from "@/lib/formato";
import type { Ausencia, Documento, TipoAusencia, Usuario } from "@/lib/tipos";

export const nomeAusencia: Record<TipoAusencia, string> = {
  folga: "Folga",
  ferias: "Férias",
  atestado: "Atestado",
  licenca: "Licença",
  outro: "Outro",
};

const categorias: Record<string, string> = {
  contrato: "Contrato",
  identidade: "RG / CPF / CNH",
  ctps: "Carteira de trabalho",
  comprovante: "Comprovante de endereço",
  atestado: "Atestado",
  exame: "Exame (ASO)",
  ferias: "Férias",
  outro: "Outro",
};

const LIMITE_MB = 20;

function hoje() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// nome de arquivo seguro para o Storage (sem acento, espaço ou barra)
function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "arquivo";
}

function dias(a: Ausencia) {
  const n = Math.round((Date.parse(a.fim) - Date.parse(a.inicio)) / 86400000) + 1;
  return n === 1 ? "1 dia" : `${n} dias`;
}

/** Folgas/ausências e documentos de um colaborador, lançados pelo admin ou gestor. */
export function FichaColaborador({ pessoa, empresaId, fechar }: { pessoa: Usuario; empresaId: string; fechar: () => void }) {
  const [aba, setAba] = useState<"folgas" | "documentos">("folgas");
  const [ausencias, setAusencias] = useState<Ausencia[] | null>(null);
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [folga, setFolga] = useState({ tipo: "folga" as TipoAusencia, inicio: hoje(), fim: hoje(), abona: true, observacao: "" });
  const [doc, setDoc] = useState({ categoria: "outro", observacao: "" });
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [chaveArquivo, setChaveArquivo] = useState(0);

  const carregar = useCallback(async () => {
    const [a, d] = await Promise.all([
      supabase.from("ausencias").select("*").eq("usuario_id", pessoa.id).order("inicio", { ascending: false }),
      supabase.from("documentos").select("*").eq("usuario_id", pessoa.id).order("criado_em", { ascending: false }),
    ]);
    if (a.error || d.error) setErro((a.error ?? d.error)!.message);
    setAusencias((a.data as Ausencia[]) ?? []);
    setDocumentos((d.data as Documento[]) ?? []);
  }, [pessoa.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function lancarFolga(e: React.FormEvent) {
    e.preventDefault();
    if (folga.fim < folga.inicio) { setErro("A data final precisa ser igual ou depois da inicial."); return; }
    setOcupado(true);
    setErro(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("ausencias").insert({
      empresa_id: empresaId, usuario_id: pessoa.id, tipo: folga.tipo, inicio: folga.inicio, fim: folga.fim,
      abona: folga.abona, observacao: folga.observacao.trim() || null, criado_por: user?.id ?? null,
    });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    setFolga({ ...folga, observacao: "" });
    carregar();
  }

  async function apagarFolga(a: Ausencia) {
    if (!confirm(`Apagar ${nomeAusencia[a.tipo].toLowerCase()} de ${dataBR(a.inicio)}?`)) return;
    const { error } = await supabase.from("ausencias").delete().eq("id", a.id);
    if (error) setErro(error.message); else carregar();
  }

  async function enviarDocumentos(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivos.length) { setErro("Escolha pelo menos um arquivo."); return; }
    const grande = arquivos.find((f) => f.size > LIMITE_MB * 1024 * 1024);
    if (grande) { setErro(`"${grande.name}" passa de ${LIMITE_MB} MB.`); return; }
    setOcupado(true);
    setErro(null);
    const { data: { user } } = await supabase.auth.getUser();
    try {
      for (const f of arquivos) {
        const caminho = `${empresaId}/${pessoa.id}/${crypto.randomUUID()}-${nomeSeguro(f.name)}`;
        const envio = await supabase.storage.from("documentos").upload(caminho, f, { contentType: f.type || undefined });
        if (envio.error) throw new Error(`Não consegui enviar "${f.name}": ${envio.error.message}`);
        const { error } = await supabase.from("documentos").insert({
          empresa_id: empresaId, usuario_id: pessoa.id, nome: f.name, categoria: doc.categoria, caminho,
          tamanho: f.size, tipo_arquivo: f.type || null, observacao: doc.observacao.trim() || null, enviado_por: user?.id ?? null,
        });
        if (error) {
          await supabase.storage.from("documentos").remove([caminho]);
          throw new Error(error.message);
        }
      }
      setArquivos([]);
      setChaveArquivo((k) => k + 1);
      setDoc({ ...doc, observacao: "" });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
      carregar();
    }
  }

  async function abrirDocumento(d: Documento) {
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(d.caminho, 120, { download: d.nome });
    if (error || !data) { setErro(error?.message ?? "Não consegui abrir o arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function apagarDocumento(d: Documento) {
    if (!confirm(`Apagar o documento "${d.nome}"? Não dá para desfazer.`)) return;
    const arq = await supabase.storage.from("documentos").remove([d.caminho]);
    if (arq.error) { setErro(arq.error.message); return; }
    const { error } = await supabase.from("documentos").delete().eq("id", d.id);
    if (error) setErro(error.message); else carregar();
  }

  const futuras = (ausencias ?? []).filter((a) => a.fim >= hoje());
  const passadas = (ausencias ?? []).filter((a) => a.fim < hoje());

  return (
    <section className="cartao p-6 animate-entrar">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{pessoa.nome}</h2>
          <p className="text-sm text-suave">Folgas, ausências e documentos</p>
        </div>
        <button className="botao-sec px-2.5" onClick={fechar} aria-label="Fechar"><X size={16} /></button>
      </div>

      <div className="mt-4 flex gap-1 border-b border-linha text-sm">
        {(["folgas", "documentos"] as const).map((a) => (
          <button key={a} onClick={() => { setAba(a); setErro(null); }}
            className={`-mb-px border-b-2 px-3 py-2 font-medium transition ${aba === a ? "border-tinta text-tinta" : "border-transparent text-suave hover:text-tinta"}`}>
            {a === "folgas" ? `Folgas e ausências${ausencias ? ` (${ausencias.length})` : ""}` : `Documentos${documentos ? ` (${documentos.length})` : ""}`}
          </button>
        ))}
      </div>

      {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}

      {aba === "folgas" && (
        <div className="mt-4 space-y-5">
          <form onSubmit={lancarFolga} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Tipo
              <select className="campo mt-1" value={folga.tipo} onChange={(e) => setFolga({ ...folga, tipo: e.target.value as TipoAusencia })}>
                {Object.entries(nomeAusencia).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
            <label className="text-sm">De
              <input className="campo mt-1" type="date" required value={folga.inicio}
                onChange={(e) => setFolga({ ...folga, inicio: e.target.value, fim: folga.fim < e.target.value ? e.target.value : folga.fim })} />
            </label>
            <label className="text-sm">Até
              <input className="campo mt-1" type="date" required min={folga.inicio} value={folga.fim} onChange={(e) => setFolga({ ...folga, fim: e.target.value })} />
            </label>
            <label className="text-sm">Observação
              <input className="campo mt-1" placeholder="Ex.: pediu para ir ao médico" value={folga.observacao} onChange={(e) => setFolga({ ...folga, observacao: e.target.value })} />
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-3">
              <input type="checkbox" className="mt-1" checked={folga.abona} onChange={(e) => setFolga({ ...folga, abona: e.target.checked })} />
              <span>Abonar (não conta como falta no espelho)
                <span className="block text-xs text-suave">Desmarque se as horas desse dia devem ser descontadas.</span>
              </span>
            </label>
            <div className="flex items-end"><button className="botao w-full" disabled={ocupado}>{ocupado ? "Salvando…" : "Lançar"}</button></div>
          </form>

          {ausencias === null ? <div className="esqueleto h-16 w-full" /> : ausencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-suave">Nenhuma folga ou ausência lançada.</p>
          ) : (
            [["Próximas e em andamento", futuras], ["Anteriores", passadas]].map(([titulo, lista]) => (lista as Ausencia[]).length > 0 && (
              <div key={titulo as string}>
                <p className="rotulo mb-2">{titulo as string}</p>
                <ul className="divide-y divide-linha rounded-xl border border-linha">
                  {(lista as Ausencia[]).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <CalendarOff size={16} className="shrink-0 text-suave" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {nomeAusencia[a.tipo]} · {a.inicio === a.fim ? dataBR(a.inicio) : `${dataBR(a.inicio)} a ${dataBR(a.fim)}`}
                          <span className="ml-2 font-normal text-suave">{dias(a)}</span>
                        </p>
                        {a.observacao && <p className="truncate text-suave">{a.observacao}</p>}
                      </div>
                      <span className={`selo shrink-0 ${a.abona ? "bg-neutral-100 text-tinta" : "border border-neutral-300 text-suave"}`}>{a.abona ? "Abonado" : "Descontar"}</span>
                      <button className="text-suave hover:text-perigo" onClick={() => apagarFolga(a)} aria-label="Apagar"><Trash2 size={16} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {aba === "documentos" && (
        <div className="mt-4 space-y-5">
          <form onSubmit={enviarDocumentos} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm sm:col-span-2">Arquivos (PDF, foto…, até {LIMITE_MB} MB cada)
              <input key={chaveArquivo} className="campo mt-1 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1 file:text-sm"
                type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
            </label>
            <label className="text-sm">Tipo de documento
              <select className="campo mt-1" value={doc.categoria} onChange={(e) => setDoc({ ...doc, categoria: e.target.value })}>
                {Object.entries(categorias).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
            <label className="text-sm">Observação
              <input className="campo mt-1" value={doc.observacao} onChange={(e) => setDoc({ ...doc, observacao: e.target.value })} />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <button className="botao inline-flex items-center gap-2" disabled={ocupado}>
                <Paperclip size={16} /> {ocupado ? "Enviando…" : arquivos.length > 1 ? `Anexar ${arquivos.length} arquivos` : "Anexar"}
              </button>
            </div>
          </form>

          {documentos === null ? <div className="esqueleto h-16 w-full" /> : documentos.length === 0 ? (
            <p className="py-6 text-center text-sm text-suave">Nenhum documento anexado.</p>
          ) : (
            <ul className="divide-y divide-linha rounded-xl border border-linha">
              {documentos.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <FileText size={16} className="shrink-0 text-suave" />
                  <div className="min-w-0 flex-1">
                    <button className="block max-w-full truncate text-left font-medium underline-offset-4 hover:underline" onClick={() => abrirDocumento(d)}>{d.nome}</button>
                    <p className="truncate text-xs text-suave">
                      {categorias[d.categoria] ?? d.categoria} · {dataBR(d.criado_em)}{d.tamanho ? ` · ${tamanhoArquivo(d.tamanho)}` : ""}{d.observacao ? ` · ${d.observacao}` : ""}
                    </p>
                  </div>
                  <button className="text-suave hover:text-tinta" onClick={() => abrirDocumento(d)} aria-label="Baixar"><Download size={16} /></button>
                  <button className="text-suave hover:text-perigo" onClick={() => apagarDocumento(d)} aria-label="Apagar"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-suave">Os documentos ficam guardados de forma privada: só administradores e gestores da empresa conseguem ver.</p>
        </div>
      )}
    </section>
  );
}
