// Gerencia contas de colaboradores. Precisa da chave service_role (criar login no
// Supabase Auth), por isso roda no servidor e confere se quem chama é admin.
//
// POST   { acao: "criar", nome, email, senha, cpf?, pis?, cargo?, papel?, locais?: uuid[] }
// POST   { acao: "senha", usuario_id, senha }
// POST   { acao: "ativo", usuario_id, ativo }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // quem está chamando?
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: auth } = await servico.auth.getUser(token);
  if (!auth.user) return resposta({ erro: "Não autenticado" }, 401);

  const { data: admin } = await servico
    .from("usuarios")
    .select("empresa_id, papel, ativo")
    .eq("id", auth.user.id)
    .single();
  if (!admin || admin.papel !== "admin" || !admin.ativo) {
    return resposta({ erro: "Apenas o administrador pode gerenciar contas" }, 403);
  }

  const corpo = await req.json().catch(() => ({}));

  // garante que o alvo é da mesma empresa
  async function alvoDaEmpresa(id: string) {
    const { data } = await servico.from("usuarios").select("empresa_id").eq("id", id).single();
    return data?.empresa_id === admin!.empresa_id;
  }

  switch (corpo.acao) {
    case "criar": {
      const { nome, email, senha, cpf, pis, cargo, locais } = corpo;
      const papel = ["admin", "gestor", "colaborador"].includes(corpo.papel) ? corpo.papel : "colaborador";
      if (!nome || !email || !senha || String(senha).length < 6) {
        return resposta({ erro: "Informe nome, e-mail e senha (mínimo 6 caracteres)" }, 400);
      }
      const { data: criado, error } = await servico.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (error) return resposta({ erro: error.message }, 400);

      const id = criado.user.id;
      const { error: erroPerfil } = await servico.from("usuarios").insert({
        id, empresa_id: admin.empresa_id, nome, email, cpf, pis, cargo, papel,
      });
      if (erroPerfil) {
        await servico.auth.admin.deleteUser(id);
        return resposta({ erro: erroPerfil.message }, 400);
      }
      if (Array.isArray(locais) && locais.length) {
        const { data: validos } = await servico
          .from("locais").select("id").eq("empresa_id", admin.empresa_id).in("id", locais);
        await servico.from("usuario_locais").insert(
          (validos ?? []).map((l) => ({ usuario_id: id, local_id: l.id })),
        );
      }
      return resposta({ id });
    }

    case "senha": {
      if (!(await alvoDaEmpresa(corpo.usuario_id))) return resposta({ erro: "Usuário não encontrado" }, 404);
      if (!corpo.senha || String(corpo.senha).length < 6) {
        return resposta({ erro: "Senha deve ter no mínimo 6 caracteres" }, 400);
      }
      const { error } = await servico.auth.admin.updateUserById(corpo.usuario_id, { password: corpo.senha });
      return error ? resposta({ erro: error.message }, 400) : resposta({ ok: true });
    }

    case "ativo": {
      if (!(await alvoDaEmpresa(corpo.usuario_id))) return resposta({ erro: "Usuário não encontrado" }, 404);
      if (corpo.usuario_id === auth.user.id) return resposta({ erro: "Você não pode desativar a si mesmo" }, 400);
      const ativo = Boolean(corpo.ativo);
      await servico.from("usuarios").update({ ativo }).eq("id", corpo.usuario_id);
      // desativado não consegue mais entrar
      await servico.auth.admin.updateUserById(corpo.usuario_id, { ban_duration: ativo ? "none" : "876000h" });
      return resposta({ ok: true });
    }

    default:
      return resposta({ erro: "Ação inválida" }, 400);
  }
});
