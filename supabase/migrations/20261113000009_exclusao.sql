-- Exclusão de registros pelo administrador (ex.: limpar testes).
-- Batidas continuam protegidas contra alteração e exclusão comuns; só as funções
-- abaixo, chamadas por um administrador, conseguem apagar.

create or replace function proteger_batida() returns trigger
language plpgsql as $$
begin
  -- exclusão autorizada pelas funções de administrador desta migração
  if current_setting('ponto.exclusao_admin', true) = 'sim' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Batidas não podem ser apagadas';
  end if;
  if (new.id, new.id_cliente, new.empresa_id, new.usuario_id, new.local_id, new.tipo,
      new.registrado_em, new.hora_dispositivo, new.lat, new.lng, new.precisao_m,
      new.dentro_cerca, new.distancia_m, new.mock_location, new.foto_path, new.dispositivo,
      new.sincronizada_offline, new.nsr, new.hash_comprovante, new.motivo_rejeicao)
     is distinct from
     (old.id, old.id_cliente, old.empresa_id, old.usuario_id, old.local_id, old.tipo,
      old.registrado_em, old.hora_dispositivo, old.lat, old.lng, old.precisao_m,
      old.dentro_cerca, old.distancia_m, old.mock_location, old.foto_path, old.dispositivo,
      old.sincronizada_offline, old.nsr, old.hash_comprovante, old.motivo_rejeicao) then
    raise exception 'Os dados de uma batida não podem ser alterados; registre um ajuste';
  end if;
  if new.status is distinct from old.status and old.status <> 'pendente_revisao' then
    raise exception 'Status da batida só pode mudar quando está pendente de revisão';
  end if;
  return new;
end $$;

-- ao apagar um local, as batidas feitas nele ficam sem local (não somem)
alter table batidas drop constraint batidas_local_id_fkey,
  add constraint batidas_local_id_fkey foreign key (local_id) references locais (id) on delete set null;

-- Apaga batidas da empresa. Devolve os caminhos das fotos para o painel apagar os arquivos.
create function excluir_batidas(p_ids uuid[]) returns setof text
language plpgsql security definer set search_path = public as $$
begin
  if not sou_admin() then raise exception 'Apenas o administrador pode excluir batidas'; end if;
  perform set_config('ponto.exclusao_admin', 'sim', true);
  delete from ajustes a using batidas b
  where a.batida_id = b.id and b.id = any (p_ids) and b.empresa_id = minha_empresa();
  return query
    delete from batidas b where b.id = any (p_ids) and b.empresa_id = minha_empresa()
    returning b.foto_path;
  perform set_config('ponto.exclusao_admin', '', true);
end $$;

-- Apaga um local; batidas feitas nele continuam, sem o local.
create function excluir_local(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not sou_admin() then raise exception 'Apenas o administrador pode excluir locais'; end if;
  perform set_config('ponto.exclusao_admin', 'sim', true);
  delete from locais where id = p_id and empresa_id = minha_empresa();
  perform set_config('ponto.exclusao_admin', '', true);
end $$;

-- Apaga todos os registros de um colaborador (batidas, ajustes, trajeto, alertas...).
-- A conta de login é apagada depois pela função "colaboradores" (precisa da chave do servidor).
create function excluir_dados_colaborador(p_usuario uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not sou_admin() then raise exception 'Apenas o administrador pode excluir colaboradores'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode excluir a si mesmo'; end if;
  if not exists (select 1 from usuarios where id = p_usuario and empresa_id = minha_empresa()) then
    raise exception 'Colaborador não encontrado';
  end if;
  perform set_config('ponto.exclusao_admin', 'sim', true);
  update batidas set revisado_por = null where revisado_por = p_usuario;
  update ajustes set decidido_por = null where decidido_por = p_usuario;
  delete from ajustes where usuario_id = p_usuario or solicitado_por = p_usuario
    or batida_id in (select id from batidas where usuario_id = p_usuario);
  delete from batidas where usuario_id = p_usuario;
  delete from localizacoes where usuario_id = p_usuario;
  delete from alertas where usuario_id = p_usuario;
  perform set_config('ponto.exclusao_admin', '', true);
end $$;

revoke execute on function excluir_batidas(uuid[]), excluir_local(uuid), excluir_dados_colaborador(uuid) from public, anon;
grant execute on function excluir_batidas(uuid[]), excluir_local(uuid), excluir_dados_colaborador(uuid) to authenticated;

-- admin apaga fotos de batidas de colaboradores da própria empresa
create policy fotos_apagar_admin on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-ponto' and public.sou_admin() and exists (
    select 1 from public.usuarios u
    where u.id::text = (storage.foldername(name))[1] and u.empresa_id = public.minha_empresa()));
