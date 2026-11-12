-- Celulares da empresa gerenciados pelo Google (Android Management API).
-- Uma linha por empresa: a "empresa no Google" vinculada e as regras escolhidas.
-- Só a função "celulares" (chave de serviço) escreve; o admin apenas lê.
create table celulares_config (
  empresa_id uuid primary key references empresas (id) on delete cascade,
  enterprise text,              -- "enterprises/LC0xxxx" depois do vínculo
  signup_name text,             -- passo intermediário do vínculo
  regras jsonb not null default '{}'::jsonb,
  apelidos jsonb not null default '{}'::jsonb,  -- nome do aparelho no Google -> apelido
  atualizado_em timestamptz not null default now()
);

alter table celulares_config enable row level security;
create policy celulares_config_ler on celulares_config for select to authenticated
  using (empresa_id = minha_empresa() and sou_admin());

revoke all on celulares_config from anon, authenticated;
grant select on celulares_config to authenticated;
