"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  BatteryMedium, Check, Download, Lock, Power, QrCode, RefreshCw, ShieldCheck, Smartphone, Store, Trash2, X,
} from "lucide-react";
import { useUsuario } from "@/components/Sessao";
import { Cabecalho } from "@/components/ui";
import { celulares } from "@/lib/supabase";

type Regras = { outrosApps: string[]; modoExclusivo: boolean; gpsSempreLigado: boolean; bloquearReset: boolean };
type Estado = { vinculado: boolean; enterprise: string | null; pacote: string; regras: Regras; chave_google: boolean };
type Aparelho = {
  nome: string; apelido: string | null; marca: string | null; modelo: string | null; serie: string | null;
  android: string | null; estado: string | null; em_dia: boolean | null; pendencias: string[];
  ultimo_contato: string | null; cadastrado_em: string | null; bateria: number | null; app_versao: string | null;
};

const appsComuns = [
  { pacote: "com.whatsapp", nome: "WhatsApp" },
  { pacote: "com.whatsapp.w4b", nome: "WhatsApp Business" },
  { pacote: "com.android.chrome", nome: "Chrome" },
  { pacote: "com.google.android.gm", nome: "Gmail" },
  { pacote: "com.google.android.apps.maps", nome: "Google Maps" },
  { pacote: "com.waze", nome: "Waze" },
  { pacote: "com.google.android.calendar", nome: "Agenda" },
  { pacote: "com.google.android.apps.docs", nome: "Google Drive" },
];

const linkApk = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/app/ponto.apk`;

function quando(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString("pt-BR");
}

export default function PaginaCelulares() {
  const eu = useUsuario();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEstado(await celulares<Estado>({ acao: "estado" }));
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (eu.papel !== "admin") return;
    // volta do cadastro no Google: ?enterpriseToken=...
    const token = new URLSearchParams(window.location.search).get("enterpriseToken");
    (async () => {
      if (token) {
        setVinculando(true);
        try {
          await celulares({ acao: "vincular_fim", enterpriseToken: token });
        } catch (e) {
          setErro((e as Error).message);
        }
        window.history.replaceState(null, "", "/celulares");
        setVinculando(false);
      }
      carregar();
    })();
  }, [eu.papel, carregar]);

  if (eu.papel !== "admin") return <p className="text-suave">Apenas o administrador gerencia os celulares.</p>;

  return (
    <div className="space-y-6">
      <Cabecalho titulo="Celulares" subtitulo="Bloqueie os celulares da empresa: o app de ponto não sai e só se atualiza." />
      {erro && (
        <p className="cartao flex items-start justify-between gap-3 p-3 text-sm text-perigo">
          {erro}
          <button onClick={() => setErro(null)} aria-label="Fechar"><X size={16} /></button>
        </p>
      )}
      {!estado || vinculando ? (
        <div className="cartao p-6 text-sm text-suave">{vinculando ? "Concluindo o vínculo com o Google…" : "Carregando…"}</div>
      ) : !estado.chave_google ? (
        <div className="cartao p-6 text-sm">A chave do Google ainda não foi cadastrada no servidor (GOOGLE_AMAPI_KEY).</div>
      ) : !estado.vinculado ? (
        <Vincular aoErro={setErro} />
      ) : (
        <Vinculado estado={estado} aoErro={setErro} recarregar={carregar} />
      )}
    </div>
  );
}

function Vincular({ aoErro }: { aoErro: (e: string) => void }) {
  const [indo, setIndo] = useState(false);
  async function vincular() {
    setIndo(true);
    try {
      const { url } = await celulares<{ url: string }>({ acao: "vincular_inicio", retorno: `${window.location.origin}/celulares` });
      window.location.href = url;
    } catch (e) {
      aoErro((e as Error).message);
      setIndo(false);
    }
  }
  return (
    <div className="cartao max-w-2xl space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tinta text-papel"><ShieldCheck size={20} /></span>
        <div>
          <p className="font-semibold">Vincular a empresa ao Google</p>
          <p className="text-sm text-suave">Feito uma vez só. É grátis.</p>
        </div>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-suave">
        <li>Clique no botão abaixo. Abre uma página do Google.</li>
        <li>Entre com o Gmail da empresa (não use o pessoal).</li>
        <li>Preencha o nome da empresa, aceite os termos e conclua.</li>
        <li>O Google traz o Senhor de volta para esta página, já vinculado.</li>
      </ol>
      <button className="botao" onClick={vincular} disabled={indo}>{indo ? "Abrindo o Google…" : "Vincular com o Google"}</button>
    </div>
  );
}

function Vinculado({ estado, aoErro, recarregar }: { estado: Estado; aoErro: (e: string) => void; recarregar: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Loja pacote={estado.pacote} aoErro={aoErro} />
        <Cadastro aoErro={aoErro} />
      </div>
      <FormRegras inicial={estado.regras} aoErro={aoErro} />
      <Lista aoErro={aoErro} />
      <Desvincular aoErro={aoErro} recarregar={recarregar} />
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="cartao space-y-3 p-5">
      <p className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tinta text-xs text-papel">{n}</span>
        {titulo}
      </p>
      {children}
    </section>
  );
}

function Loja({ pacote, aoErro }: { pacote: string; aoErro: (e: string) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  async function abrir() {
    setAbrindo(true);
    try {
      const r = await celulares<{ token: string }>({ acao: "token_play", origem: `${window.location.origin}/celulares` });
      setToken(r.token);
    } catch (e) {
      aoErro((e as Error).message);
    } finally {
      setAbrindo(false);
    }
  }
  return (
    <Passo n={1} titulo="Publicar o app na loja da empresa">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-suave">
        <li>Baixe o app no computador: <a href={linkApk} className="inline-flex items-center gap-1 font-medium text-tinta underline"><Download size={14} />ponto.apk</a></li>
        <li>Abra a loja abaixo, clique em <b>Apps particulares</b> e no botão <b>+</b>.</li>
        <li>Nome: <b>Ponto</b>. Envie o arquivo ponto.apk e clique em Criar.</li>
        <li>Em até 10 minutos o app vai sozinho para os celulares cadastrados.</li>
      </ol>
      <p className="text-xs text-suave">
        Atualizar: quando houver versão nova, baixe o ponto.apk de novo e envie no mesmo app particular (Editar). Os celulares se atualizam sozinhos.
        Pacote: <code>{pacote}</code>
      </p>
      {token ? (
        <div className="overflow-hidden rounded-xl border border-linha bg-[#fff]">
          <iframe
            title="Loja da empresa"
            className="h-[640px] w-full"
            src={`https://play.google.com/work/embedded/search?token=${encodeURIComponent(token)}&mode=SELECT&locale=pt_BR`}
          />
        </div>
      ) : (
        <button className="botao-sec" onClick={abrir} disabled={abrindo}><Store size={16} />{abrindo ? "Abrindo…" : "Abrir a loja da empresa"}</button>
      )}
    </Passo>
  );
}

function Cadastro({ aoErro }: { aoErro: (e: string) => void }) {
  const [qr, setQr] = useState<{ imagem: string; codigo: string; expira: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  async function gerar() {
    setGerando(true);
    try {
      const r = await celulares<{ qr: string; codigo: string; expira: string }>({ acao: "qr" });
      setQr({ imagem: await QRCode.toDataURL(r.qr, { width: 360, margin: 1 }), codigo: r.codigo, expira: r.expira });
    } catch (e) {
      aoErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }
  return (
    <Passo n={2} titulo="Cadastrar um celular">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-suave">
        <li>O celular precisa estar <b>zerado</b> (restaurado de fábrica). Tudo nele é apagado.</li>
        <li>Na primeira tela (&quot;Bem-vindo&quot;), toque <b>6 vezes</b> no mesmo lugar da tela.</li>
        <li>Conecte no Wi-Fi e aponte a câmera para o QR Code abaixo.</li>
        <li>Siga as telas. O app de ponto instala sozinho e fica travado.</li>
      </ol>
      {qr ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.imagem} alt="QR Code de cadastro" className="w-64 rounded-lg bg-[#fff] p-2" />
          <p className="text-center text-xs text-suave">
            Sem câmera? Na tela do Google digite o código <code className="text-tinta">{qr.codigo}</code>.
            <br />Vale até {new Date(qr.expira).toLocaleDateString("pt-BR")} e serve para vários celulares.
          </p>
        </div>
      ) : (
        <button className="botao-sec" onClick={gerar} disabled={gerando}><QrCode size={16} />{gerando ? "Gerando…" : "Gerar QR Code"}</button>
      )}
    </Passo>
  );
}

function Opcao({ marcado, aoMudar, titulo, texto }: { marcado: boolean; aoMudar: (v: boolean) => void; titulo: string; texto: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linha p-3">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-tinta)]" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs text-suave">{texto}</span>
      </span>
    </label>
  );
}

function FormRegras({ inicial, aoErro }: { inicial: Regras; aoErro: (e: string) => void }) {
  const [regras, setRegras] = useState(inicial);
  const [outro, setOutro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const muda = (r: Partial<Regras>) => { setRegras({ ...regras, ...r }); setSalvo(false); };
  const alternaApp = (p: string) =>
    muda({ outrosApps: regras.outrosApps.includes(p) ? regras.outrosApps.filter((x) => x !== p) : [...regras.outrosApps, p] });
  const extras = regras.outrosApps.filter((p) => !appsComuns.some((a) => a.pacote === p));

  async function salvar() {
    setSalvando(true);
    try {
      const r = await celulares<{ regras: Regras }>({ acao: "regras", regras });
      setRegras(r.regras);
      setSalvo(true);
    } catch (e) {
      aoErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Passo n={3} titulo="Regras dos celulares">
      <p className="text-sm text-suave">
        Sempre ativo: o app de ponto <b>não pode ser desinstalado</b>, recebe câmera e localização liberadas e se atualiza sozinho.
        Fora isso, só abre o que estiver marcado aqui.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Opcao marcado={regras.gpsSempreLigado} aoMudar={(v) => muda({ gpsSempreLigado: v })} titulo="GPS sempre ligado" texto="O colaborador não consegue desligar a localização." />
        <Opcao marcado={regras.bloquearReset} aoMudar={(v) => muda({ bloquearReset: v })} titulo="Impedir restaurar de fábrica" texto="Não dá para zerar o celular pelas configurações." />
        <Opcao marcado={regras.modoExclusivo} aoMudar={(v) => muda({ modoExclusivo: v })} titulo="Só o app de ponto" texto="O celular abre direto no ponto e nada mais (modo quiosque)." />
      </div>
      {!regras.modoExclusivo && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Outros apps liberados</p>
          <div className="flex flex-wrap gap-2">
            {appsComuns.map((a) => {
              const ativo = regras.outrosApps.includes(a.pacote);
              return (
                <button key={a.pacote} type="button" onClick={() => alternaApp(a.pacote)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${ativo ? "border-tinta bg-tinta text-papel" : "border-linha text-suave hover:text-tinta"}`}>
                  {ativo && <Check size={14} />}{a.nome}
                </button>
              );
            })}
            {extras.map((p) => (
              <button key={p} type="button" onClick={() => alternaApp(p)} className="flex items-center gap-1.5 rounded-full border border-tinta bg-tinta px-3 py-1.5 text-sm text-papel">
                <X size={14} />{p}
              </button>
            ))}
          </div>
          <form className="flex max-w-md gap-2" onSubmit={(e) => {
            e.preventDefault();
            const p = outro.trim();
            if (/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(p) && !regras.outrosApps.includes(p)) muda({ outrosApps: [...regras.outrosApps, p] });
            setOutro("");
          }}>
            <input className="campo" placeholder="Outro app (ex.: com.empresa.app)" value={outro} onChange={(e) => setOutro(e.target.value)} />
            <button className="botao-sec shrink-0">Adicionar</button>
          </form>
          <p className="text-xs text-suave">O nome do pacote aparece no endereço do app na Play Store, depois de &quot;id=&quot;.</p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="botao" onClick={salvar} disabled={salvando}>{salvando ? "Aplicando…" : "Salvar e aplicar"}</button>
        {salvo && <span className="text-sm text-suave">Aplicado. Os celulares recebem em alguns minutos.</span>}
      </div>
    </Passo>
  );
}

const nomesEstado: Record<string, string> = {
  ACTIVE: "Ativo", DISABLED: "Desativado", PROVISIONING: "Configurando", LOST: "Perdido",
};

function Lista({ aoErro }: { aoErro: (e: string) => void }) {
  const [aparelhos, setAparelhos] = useState<Aparelho[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setAparelhos((await celulares<{ aparelhos: Aparelho[] }>({ acao: "aparelhos" })).aparelhos);
    } catch (e) {
      aoErro((e as Error).message);
      setAparelhos([]);
    } finally {
      setCarregando(false);
    }
  }, [aoErro]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Celulares cadastrados</h2>
        <button className="botao-sec" onClick={carregar} disabled={carregando}>
          <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />Atualizar
        </button>
      </div>
      {aparelhos === null ? (
        <div className="cartao p-5 text-sm text-suave">Carregando…</div>
      ) : aparelhos.length === 0 ? (
        <div className="cartao p-5 text-sm text-suave">Nenhum celular cadastrado ainda. Use o QR Code do passo 2.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {aparelhos.map((a) => <CartaoAparelho key={a.nome} a={a} aoErro={aoErro} recarregar={carregar} />)}
        </div>
      )}
    </section>
  );
}

function CartaoAparelho({ a, aoErro, recarregar }: { a: Aparelho; aoErro: (e: string) => void; recarregar: () => void }) {
  const [apelido, setApelido] = useState(a.apelido ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const desativado = a.estado === "DISABLED";

  async function comando(tipo: string, texto: string) {
    setOcupado(tipo);
    setAviso(null);
    try {
      await celulares({ acao: "comando", aparelho: a.nome, tipo });
      setAviso(texto);
      if (tipo !== "LOCK" && tipo !== "REBOOT") recarregar();
    } catch (e) {
      aoErro((e as Error).message);
    } finally {
      setOcupado(null);
      setConfirmar(false);
    }
  }

  async function salvarApelido() {
    if (apelido.trim() === (a.apelido ?? "")) return;
    try {
      await celulares({ acao: "apelido", aparelho: a.nome, apelido });
    } catch (e) {
      aoErro((e as Error).message);
    }
  }

  return (
    <div className="cartao space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100"><Smartphone size={18} /></span>
        <div className="min-w-0 flex-1">
          <input
            className="w-full bg-transparent font-medium outline-none placeholder:text-suave"
            placeholder="Dê um nome (ex.: Celular do João)"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            onBlur={salvarApelido}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <p className="truncate text-xs text-suave">{[a.marca, a.modelo].filter(Boolean).join(" ") || "Celular"}{a.android ? ` · Android ${a.android}` : ""}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${desativado ? "bg-red-100 text-red-800" : a.em_dia === false ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {desativado ? "Desativado" : a.em_dia === false ? "Pendente" : nomesEstado[a.estado ?? ""] ?? a.estado}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-suave">Último sinal</dt><dd>{quando(a.ultimo_contato)}</dd></div>
        <div><dt className="text-suave">Bateria</dt><dd className="flex items-center gap-1">{a.bateria != null ? <><BatteryMedium size={13} />{Math.round(a.bateria)}%</> : "—"}</dd></div>
        <div><dt className="text-suave">App de ponto</dt><dd>{a.app_versao ?? "não instalado"}</dd></div>
      </dl>
      {a.em_dia === false && a.pendencias.length > 0 && (
        <p className="text-xs text-suave">Pendência: {a.pendencias.join(", ")}. Se o app de ponto ainda não foi publicado na loja (passo 1), é isso.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="botao-sec !px-3 !py-1.5 text-xs" disabled={!!ocupado} onClick={() => comando("LOCK", "Tela travada.")}><Lock size={14} />Travar tela</button>
        <button className="botao-sec !px-3 !py-1.5 text-xs" disabled={!!ocupado} onClick={() => comando("REBOOT", "Reiniciando.")}><Power size={14} />Reiniciar</button>
        <button className="botao-sec !px-3 !py-1.5 text-xs" disabled={!!ocupado}
          onClick={() => comando(desativado ? "REATIVAR" : "DESATIVAR", desativado ? "Celular reativado." : "Celular desativado.")}>
          <ShieldCheck size={14} />{desativado ? "Reativar" : "Desativar"}
        </button>
        {confirmar ? (
          <span className="flex items-center gap-2 text-xs">
            Apagar tudo do celular?
            <button className="botao !bg-perigo !px-3 !py-1.5 text-xs" disabled={!!ocupado} onClick={() => comando("APAGAR", "Celular apagado e removido.")}>Sim, apagar</button>
            <button className="text-suave underline" onClick={() => setConfirmar(false)}>Não</button>
          </span>
        ) : (
          <button className="botao-sec !px-3 !py-1.5 text-xs text-perigo" disabled={!!ocupado} onClick={() => setConfirmar(true)}><Trash2 size={14} />Apagar</button>
        )}
      </div>
      {ocupado && <p className="text-xs text-suave">Enviando…</p>}
      {aviso && <p className="text-xs text-suave">{aviso}</p>}
    </div>
  );
}

function Desvincular({ aoErro, recarregar }: { aoErro: (e: string) => void; recarregar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  async function desvincular() {
    try {
      await celulares({ acao: "desvincular" });
      recarregar();
    } catch (e) {
      aoErro((e as Error).message);
    }
  }
  return (
    <p className="text-xs text-suave">
      {confirmar ? (
        <>
          Desvincular faz o painel parar de controlar os celulares já cadastrados.{" "}
          <button className="text-perigo underline" onClick={desvincular}>Desvincular mesmo assim</button>{" · "}
          <button className="underline" onClick={() => setConfirmar(false)}>Cancelar</button>
        </>
      ) : (
        <button className="underline" onClick={() => setConfirmar(true)}>Vinculou com o Gmail errado? Desvincular</button>
      )}
    </p>
  );
}
