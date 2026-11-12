-- Corrige "infinite recursion detected in policy for relation usuario_locais":
-- a regra de usuario_locais consultava locais, cuja regra consulta usuario_locais.
-- As checagens passam a usar funções security definer, que não disparam RLS.

create function usuario_da_minha_empresa(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = p_usuario and empresa_id = minha_empresa())
$$;

create function local_da_minha_empresa(p_local uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from locais where id = p_local and empresa_id = minha_empresa())
$$;

drop policy usuario_locais_ler on usuario_locais;
drop policy usuario_locais_gestor on usuario_locais;

create policy usuario_locais_ler on usuario_locais for select to authenticated
  using (usuario_id = auth.uid() or (sou_gestor() and usuario_da_minha_empresa(usuario_id)));
create policy usuario_locais_gestor on usuario_locais for all to authenticated
  using (sou_gestor() and usuario_da_minha_empresa(usuario_id))
  with check (sou_gestor() and usuario_da_minha_empresa(usuario_id) and local_da_minha_empresa(local_id));
