// Celulares da empresa gerenciados pelo Google (Android Management API).
// Só o administrador usa. A chave da conta de serviço do Google fica no secret
// GOOGLE_AMAPI_KEY (o JSON inteiro), nunca no navegador.
//
// POST { acao: "estado" }
// POST { acao: "vincular_inicio", retorno }            -> { url } (página do Google)
// POST { acao: "vincular_fim", enterpriseToken }        -> conclui o vínculo
// POST { acao: "desvincular" }
// POST { acao: "regras", regras }                       -> grava e aplica nos celulares
// POST { acao: "qr" }                                   -> QR Code para cadastrar celular
// POST { acao: "aparelhos" }
// POST { acao: "comando", aparelho, tipo: LOCK|REBOOT|DESATIVAR|REATIVAR|APAGAR }
// POST { acao: "apelido", aparelho, apelido }
// POST { acao: "token_play", origem }                   -> token da Play Store da empresa (origem = URL https da página)
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// pacote do app de ponto publicado na Play Store privada da empresa
const PACOTE = Deno.env.get("PONTO_PACOTE") ?? "br.com.pontonogueira.app";
const API = "https://androidmanagement.googleapis.com/v1";

type Regras = {
  outrosApps?: string[];     // apps liberados além do ponto (ex.: com.whatsapp)
  modoExclusivo?: boolean;   // celular só abre o app de ponto
  gpsSempreLigado?: boolean;
  bloquearReset?: boolean;   // impede restaurar o celular de fábrica
};

const regrasPadrao: Required<Regras> = {
  outrosApps: [],
  modoExclusivo: false,
  gpsSempreLigado: true,
  bloquearReset: true,
};

// ---------- login no Google com a conta de serviço ----------

type ChaveGoogle = { client_email: string; private_key: string; project_id: string };
let cacheToken: { valor: string; expira: number } | null = null;

function base64url(dados: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : new Uint8Array(dados);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function chaveGoogle(): ChaveGoogle {
  const bruto = Deno.env.get("GOOGLE_AMAPI_KEY");
  if (!bruto) throw new ErroGoogle("A chave do Google (GOOGLE_AMAPI_KEY) não foi cadastrada no Supabase.");
  return JSON.parse(bruto);
}

async function tokenGoogle() {
  if (cacheToken && cacheToken.expira > Date.now() + 60_000) return cacheToken.valor;
  const chave = chaveGoogle();
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const conteudo = base64url(JSON.stringify({
    iss: chave.client_email,
    scope: "https://www.googleapis.com/auth/androidmanagement",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  }));
  const pem = chave.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const privada = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privada, new TextEncoder().encode(`${cabecalho}.${conteudo}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${conteudo}.${base64url(assinatura)}`,
    }),
  });
  const dados = await r.json();
  if (!r.ok) throw new ErroGoogle(`O Google recusou a chave: ${dados.error_description ?? dados.error}`);
  cacheToken = { valor: dados.access_token, expira: Date.now() + dados.expires_in * 1000 };
  return cacheToken.valor;
}

class ErroGoogle extends Error {}

async function google(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`${API}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${await tokenGoogle()}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : {};
  if (!r.ok) throw new ErroGoogle(dados.error?.message ?? `Erro ${r.status} do Google`);
  return dados;
}

// ---------- regras -> política do Google ----------

function politica(regras: Required<Regras>) {
  const outros = regras.outrosApps.filter((p) => /^[a-zA-Z0-9_.]+$/.test(p) && p !== PACOTE);
  return {
    applications: [
      {
        packageName: PACOTE,
        // FORCE_INSTALLED: instala sozinho, não pode ser desinstalado e se atualiza pela Play Store
        installType: regras.modoExclusivo ? "KIOSK" : "FORCE_INSTALLED",
        defaultPermissionPolicy: "GRANT", // câmera e localização já liberadas
        autoUpdateMode: "AUTO_UPDATE_HIGH_PRIORITY",
      },
      ...(regras.modoExclusivo ? [] : outros.map((packageName) => ({ packageName, installType: "AVAILABLE" }))),
    ],
    playStoreMode: "WHITELIST", // só os apps acima podem ser instalados
    locationMode: regras.gpsSempreLigado ? "LOCATION_ENFORCED" : "LOCATION_USER_CHOICE",
    factoryResetDisabled: regras.bloquearReset,
    addUserDisabled: true,
    advancedSecurityOverrides: { untrustedAppsPolicy: "DISALLOW_INSTALL" },
    statusReportingSettings: {
      applicationReportsEnabled: true,
      deviceSettingsEnabled: true,
      softwareInfoEnabled: true,
      hardwareStatusEnabled: true,
      powerManagementEventsEnabled: true,
    },
  };
}

function normalizarRegras(r: Regras | undefined): Required<Regras> {
  return {
    outrosApps: Array.isArray(r?.outrosApps) ? r!.outrosApps.map(String).slice(0, 30) : regrasPadrao.outrosApps,
    modoExclusivo: r?.modoExclusivo ?? regrasPadrao.modoExclusivo,
    gpsSempreLigado: r?.gpsSempreLigado ?? regrasPadrao.gpsSempreLigado,
    bloquearReset: r?.bloquearReset ?? regrasPadrao.bloquearReset,
  };
}

// resumo do aparelho para o painel
function resumo(d: Record<string, any>, apelidos: Record<string, string>) {
  const app = (d.applicationReports ?? []).find((a: any) => a.packageName === PACOTE);
  return {
    nome: d.name,
    apelido: apelidos[d.name] ?? null,
    marca: d.hardwareInfo?.brand ?? null,
    modelo: d.hardwareInfo?.model ?? null,
    serie: d.hardwareInfo?.serialNumber ?? null,
    android: d.softwareInfo?.androidVersion ?? null,
    estado: d.state ?? null,
    em_dia: d.policyCompliant ?? null,
    pendencias: (d.nonComplianceDetails ?? []).map((n: any) => n.nonComplianceReason ?? n.installationFailureReason).filter(Boolean),
    ultimo_contato: d.lastStatusReportTime ?? d.lastPolicySyncTime ?? null,
    cadastrado_em: d.enrollmentTime ?? null,
    bateria: d.powerManagementEvents?.findLast?.((e: any) => e.batteryLevel != null)?.batteryLevel ?? null,
    app_versao: app?.versionName ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido" }, 405);

  const servico = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: auth } = await servico.auth.getUser(token);
  if (!auth.user) return resposta({ erro: "Não autenticado" }, 401);

  const { data: eu } = await servico.from("usuarios").select("empresa_id, papel, ativo").eq("id", auth.user.id).single();
  if (!eu || eu.papel !== "admin" || !eu.ativo) {
    return resposta({ erro: "Apenas o administrador gerencia os celulares" }, 403);
  }
  const empresaId: string = eu.empresa_id;
  const corpo = await req.json().catch(() => ({}));

  const { data: linha } = await servico.from("celulares_config").select("*").eq("empresa_id", empresaId).maybeSingle();
  const config = linha ?? { empresa_id: empresaId, enterprise: null, signup_name: null, regras: {}, apelidos: {} };
  const enterprise: string | null = config.enterprise;

  async function salvar(campos: Record<string, unknown>) {
    const { error } = await servico.from("celulares_config")
      .upsert({ empresa_id: empresaId, ...campos, atualizado_em: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  // o aparelho tem de ser da empresa de quem chama
  function aparelhoValido(nome: unknown): nome is string {
    return typeof nome === "string" && !!enterprise && nome.startsWith(`${enterprise}/devices/`) && !nome.includes("..");
  }

  try {
    switch (corpo.acao) {
      case "estado":
        return resposta({
          vinculado: !!enterprise,
          enterprise,
          pacote: PACOTE,
          regras: normalizarRegras(config.regras),
          chave_google: !!Deno.env.get("GOOGLE_AMAPI_KEY"),
        });

      case "vincular_inicio": {
        const retorno = String(corpo.retorno ?? "");
        if (!/^https:\/\/[^\s]+$|^http:\/\/localhost(:\d+)?\//.test(retorno)) {
          return resposta({ erro: "Endereço de retorno inválido" }, 400);
        }
        const projeto = chaveGoogle().project_id;
        const dados = await google(
          "POST",
          `signupUrls?projectId=${encodeURIComponent(projeto)}&callbackUrl=${encodeURIComponent(retorno)}`,
        );
        await salvar({ signup_name: dados.name });
        return resposta({ url: dados.url });
      }

      case "vincular_fim": {
        if (enterprise) return resposta({ ok: true, enterprise });
        if (!config.signup_name || !corpo.enterpriseToken) {
          return resposta({ erro: "Comece o vínculo de novo pelo botão Vincular" }, 400);
        }
        const { data: empresa } = await servico.from("empresas").select("nome").eq("id", empresaId).single();
        const projeto = chaveGoogle().project_id;
        const criada = await google(
          "POST",
          `enterprises?projectId=${encodeURIComponent(projeto)}&signupUrlName=${encodeURIComponent(config.signup_name)}` +
            `&enterpriseToken=${encodeURIComponent(corpo.enterpriseToken)}`,
          { enterpriseDisplayName: empresa?.nome ?? "Empresa" },
        );
        await salvar({ enterprise: criada.name, signup_name: null });
        await google("PATCH", `${criada.name}/policies/padrao`, politica(normalizarRegras(config.regras)));
        return resposta({ ok: true, enterprise: criada.name });
      }

      case "desvincular":
        await salvar({ enterprise: null, signup_name: null });
        return resposta({ ok: true });
    }

    if (!enterprise) return resposta({ erro: "Vincule a empresa ao Google primeiro" }, 400);

    switch (corpo.acao) {
      case "regras": {
        const regras = normalizarRegras(corpo.regras);
        await google("PATCH", `${enterprise}/policies/padrao`, politica(regras));
        await salvar({ regras });
        return resposta({ ok: true, regras });
      }

      case "qr": {
        // garante que a política existe antes de gerar o QR
        await google("PATCH", `${enterprise}/policies/padrao`, politica(normalizarRegras(config.regras)));
        const t = await google("POST", `${enterprise}/enrollmentTokens`, {
          policyName: `${enterprise}/policies/padrao`,
          duration: `${30 * 24 * 3600}s`,
          allowPersonalUsage: "PERSONAL_USAGE_DISALLOWED",
          oneTimeOnly: false,
        });
        return resposta({ qr: t.qrCode, codigo: t.value, expira: t.expirationTimestamp });
      }

      case "aparelhos": {
        const lista: Record<string, unknown>[] = [];
        let pagina = "";
        do {
          const d = await google("GET", `${enterprise}/devices?pageSize=100${pagina ? `&pageToken=${pagina}` : ""}`);
          lista.push(...(d.devices ?? []));
          pagina = d.nextPageToken ?? "";
        } while (pagina && lista.length < 500);
        return resposta({
          aparelhos: lista.filter((d) => d.state !== "DELETED").map((d) => resumo(d, config.apelidos ?? {})),
        });
      }

      case "comando": {
        if (!aparelhoValido(corpo.aparelho)) return resposta({ erro: "Celular não encontrado" }, 404);
        switch (corpo.tipo) {
          case "LOCK":
          case "REBOOT":
            await google("POST", `${corpo.aparelho}:issueCommand`, { type: corpo.tipo });
            break;
          case "DESATIVAR":
          case "REATIVAR":
            await google("PATCH", `${corpo.aparelho}?updateMask=state`, {
              state: corpo.tipo === "DESATIVAR" ? "DISABLED" : "ACTIVE",
            });
            break;
          case "APAGAR":
            // apaga tudo do celular e o tira da empresa
            await google("DELETE", corpo.aparelho);
            break;
          default:
            return resposta({ erro: "Comando inválido" }, 400);
        }
        return resposta({ ok: true });
      }

      case "apelido": {
        if (!aparelhoValido(corpo.aparelho)) return resposta({ erro: "Celular não encontrado" }, 404);
        const apelidos = { ...(config.apelidos ?? {}) };
        const texto = String(corpo.apelido ?? "").trim().slice(0, 60);
        if (texto) apelidos[corpo.aparelho] = texto;
        else delete apelidos[corpo.aparelho];
        await salvar({ apelidos });
        return resposta({ ok: true });
      }

      case "token_play": {
        // endereço da página que mostra a loja (o Google exige https)
        const origem = String(corpo.origem ?? "");
        if (!/^https:\/\/[^\s]+$/.test(origem)) return resposta({ erro: "A loja só abre no painel publicado (https)" }, 400);
        const t = await google("POST", `${enterprise}/webTokens`, {
          parentFrameUrl: origem,
          enabledFeatures: ["PLAY_SEARCH", "PRIVATE_APPS"],
        });
        return resposta({ token: t.value });
      }

      default:
        return resposta({ erro: "Ação inválida" }, 400);
    }
  } catch (e) {
    const google = e instanceof ErroGoogle;
    console.error(e);
    return resposta({ erro: (e as Error).message }, google ? 502 : 500);
  }
});
