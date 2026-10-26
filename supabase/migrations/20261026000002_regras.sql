-- Ponto: funções auxiliares, regra de batida e permissões (RLS).

-- Dados do usuário logado ----------------------------------------------------

create function minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios where id = auth.uid() and ativo
$$;

create function sou_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel in ('admin', 'gestor') from usuarios where id = auth.uid() and ativo),
    false)
$$;

create function sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel = 'admin' from usuarios where id = auth.uid() and ativo),
    false)
$$;

-- Locais em que o usuário logado pode bater ponto, com distância até a posição dada.
create function meus_locais(p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, nome text, endereco text, lat double precision, lng double precision,
  raio_metros int, poligono_geojson jsonb, distancia_m double precision, dentro_cerca boolean
)
language sql stable security definer set search_path = public, extensions as $$
  select l.id, l.nome, l.endereco, l.lat, l.lng, l.raio_metros, l.poligono_geojson,
         d.distancia_m,
         case when d.distancia_m is null then null
              when l.poligono is not null then st_covers(l.poligono, d.ponto)
              else d.distancia_m <= l.raio_metros end
  from usuario_locais ul
  join locais l on l.id = ul.local_id and l.ativo
  cross join lateral (
    select ponto,
           case when ponto is null then null
                else st_distance(coalesce(l.poligono, l.centro), ponto) end as distancia_m
    from (select case when p_lat is null or p_lng is null then null
                      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as ponto) p
  ) d
  where ul.usuario_id = auth.uid()
  order by d.distancia_m nulls last, l.nome
$$;

-- Qual batida vem depois da última (validação de sequência) -------------------

create function proximas_batidas_permitidas(p_usuario uuid)
returns tipo_batida[]
language sql stable security definer set search_path = public as $$
  -- considera aberta uma jornada iniciada há menos de 16 horas
  select case ultima.tipo
           when 'entrada' then array['inicio_intervalo', 'saida']::tipo_batida[]
           when 'inicio_intervalo' then array['fim_intervalo']::tipo_batida[]
           when 'fim_intervalo' then array['inicio_intervalo', 'saida']::tipo_batida[]
           else array['entrada']::tipo_batida[]
         end
  from (select null::int) x
  left join lateral (
    select b.tipo from batidas b
    where b.usuario_id = p_usuario
      and b.status <> 'rejeitada'
      and b.registrado_em > now() - interval '16 hours'
    order by b.registrado_em desc, b.nsr desc
    limit 1
  ) ultima on true
$$;

-- Registrar batida ----------------------------------------------------------
-- Toda a validação acontece aqui, no servidor: hora oficial, cerca virtual,
-- precisão do GPS, GPS falso e sequência. Tentativas recusadas também ficam
-- gravadas (status "rejeitada", sem NSR) para o gestor ver.

create function registrar_batida(
  p_id_cliente uuid,
  p_tipo tipo_batida,
  p_lat double precision,
  p_lng double precision,
  p_precisao_m real default null,
  p_mock_location boolean default false,
  p_hora_dispositivo timestamptz default null,
  p_foto_path text default null,
  p_dispositivo text default null,
  p_offline boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_usuario usuarios;
  v_empresa empresas;
  v_existente batidas;
  v_local record;
  v_motivo text;
  v_status status_batida;
  v_nsr bigint;
  v_agora timestamptz := now();
  v_batida batidas;
begin
  select * into v_usuario from usuarios where id = auth.uid() and ativo;
  if not found then
    raise exception 'Usuário não encontrado ou inativo' using errcode = '42501';
  end if;
  select * into v_empresa from empresas where id = v_usuario.empresa_id;

  -- reenvio da mesma batida (ex.: celular voltou a ter internet): devolve a original
  select * into v_existente from batidas
  where usuario_id = v_usuario.id and id_cliente = p_id_cliente;
  if found then
    return comprovante(v_existente);
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'Localização obrigatória';
  end if;

  -- local vinculado mais próximo
  select * into v_local from meus_locais(p_lat, p_lng) limit 1;

  if v_local.id is null then
    v_motivo := 'Colaborador sem local de trabalho cadastrado';
  elsif coalesce(p_mock_location, false) then
    v_motivo := 'Localização falsa detectada';
  elsif p_precisao_m is not null and p_precisao_m > v_empresa.precisao_max_m then
    v_motivo := format('GPS impreciso (%s m); vá para um lugar aberto e tente de novo', round(p_precisao_m));
  elsif not v_local.dentro_cerca then
    v_motivo := format('Fora do local de trabalho (%s m de %s)', round(v_local.distancia_m), v_local.nome);
  elsif not (p_tipo = any (proximas_batidas_permitidas(v_usuario.id))) then
    v_motivo := 'Batida fora de ordem: a próxima deve ser ' || (
      select string_agg(case t when 'entrada' then 'entrada' when 'inicio_intervalo' then 'início do intervalo'
                               when 'fim_intervalo' then 'fim do intervalo' else 'saída' end, ' ou ')
      from unnest(proximas_batidas_permitidas(v_usuario.id)) t);
  end if;

  if v_motivo is not null then
    v_status := 'rejeitada';
  elsif p_offline and p_hora_dispositivo is not null
        and abs(extract(epoch from (v_agora - p_hora_dispositivo))) > 300 then
    -- batida feita sem internet: a hora oficial é a do recebimento e o gestor revisa
    v_status := 'pendente_revisao';
  else
    v_status := 'valida';
  end if;

  if v_status <> 'rejeitada' then
    update empresas set ultimo_nsr = ultimo_nsr + 1
    where id = v_empresa.id returning ultimo_nsr into v_nsr;
  end if;

  insert into batidas (
    id_cliente, empresa_id, usuario_id, local_id, tipo, registrado_em, hora_dispositivo,
    lat, lng, precisao_m, dentro_cerca, distancia_m, mock_location, foto_path, dispositivo,
    sincronizada_offline, nsr, hash_comprovante, status, motivo_rejeicao
  ) values (
    p_id_cliente, v_empresa.id, v_usuario.id, v_local.id, p_tipo, v_agora, p_hora_dispositivo,
    p_lat, p_lng, p_precisao_m, coalesce(v_local.dentro_cerca, false), v_local.distancia_m,
    coalesce(p_mock_location, false), p_foto_path, p_dispositivo,
    coalesce(p_offline, false), v_nsr,
    case when v_nsr is null then null else encode(sha256(convert_to(concat_ws('|',
      v_empresa.cnpj, v_nsr, v_usuario.cpf, v_usuario.id, p_tipo,
      to_char(v_agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), p_lat, p_lng), 'UTF8')), 'hex') end,
    v_status, v_motivo
  ) returning * into v_batida;

  if v_status = 'rejeitada' and (p_mock_location or v_local.dentro_cerca = false) then
    insert into alertas (empresa_id, usuario_id, tipo, detalhes)
    values (v_empresa.id, v_usuario.id,
            case when p_mock_location then 'gps_falso' else 'fora_cerca' end::tipo_alerta,
            jsonb_build_object('batida_id', v_batida.id, 'tipo', p_tipo, 'motivo', v_motivo,
                               'lat', p_lat, 'lng', p_lng, 'distancia_m', v_local.distancia_m));
  end if;

  return comprovante(v_batida);
end $$;

create function comprovante(b batidas) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id,
    'id_cliente', b.id_cliente,
    'tipo', b.tipo,
    'status', b.status,
    'motivo_rejeicao', b.motivo_rejeicao,
    'registrado_em', b.registrado_em,
    'nsr', b.nsr,
    'hash', b.hash_comprovante,
    'local', (select nome from locais where id = b.local_id),
    'distancia_m', round(b.distancia_m::numeric),
    'colaborador', u.nome,
    'cpf', u.cpf,
    'empresa', e.nome,
    'cnpj', e.cnpj
  )
  from usuarios u join empresas e on e.id = u.empresa_id
  where u.id = b.usuario_id
$$;

-- Envio de localização em lote (só durante a jornada) --------------------------

create function enviar_localizacoes(p_pontos jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_usuario usuarios;
  v_qtd int;
begin
  select * into v_usuario from usuarios where id = auth.uid() and ativo;
  if not found then
    raise exception 'Usuário não encontrado ou inativo' using errcode = '42501';
  end if;
  -- LGPD: fora da jornada nada é gravado
  if 'entrada' = any (proximas_batidas_permitidas(v_usuario.id)) then
    return 0;
  end if;
  insert into localizacoes (empresa_id, usuario_id, lat, lng, precisao_m, velocidade,
                            bateria, mock_location, capturado_em)
  select v_usuario.empresa_id, v_usuario.id, (p->>'lat')::float8, (p->>'lng')::float8,
         (p->>'precisao_m')::real, (p->>'velocidade')::real, (p->>'bateria')::smallint,
         coalesce((p->>'mock_location')::boolean, false), (p->>'capturado_em')::timestamptz
  from jsonb_array_elements(p_pontos) p
  where (p->>'capturado_em')::timestamptz > now() - interval '24 hours';
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- Painel: situação atual de cada colaborador ---------------------------------

create function painel_colaboradores()
returns table (
  usuario_id uuid, nome text, cargo text, situacao text,
  ultima_batida_tipo tipo_batida, ultima_batida_em timestamptz, ultima_batida_local text,
  lat double precision, lng double precision, posicao_em timestamptz, bateria smallint
)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.cargo,
         case
           when b.tipo is null or b.tipo = 'saida' then 'fora_jornada'
           when b.tipo = 'inicio_intervalo' then 'intervalo'
           else 'trabalhando'
         end,
         b.tipo, b.registrado_em, l.nome,
         coalesce(p.lat, b.lat), coalesce(p.lng, b.lng),
         coalesce(p.capturado_em, b.registrado_em), p.bateria
  from usuarios u
  left join lateral (
    select * from batidas
    where usuario_id = u.id and status <> 'rejeitada' and registrado_em > now() - interval '16 hours'
    order by registrado_em desc limit 1
  ) b on true
  left join locais l on l.id = b.local_id
  left join lateral (
    select * from localizacoes
    where usuario_id = u.id and b.tipo is not null and b.tipo <> 'saida'
      and capturado_em >= b.registrado_em
    order by capturado_em desc limit 1
  ) p on true
  where sou_gestor() and u.empresa_id = minha_empresa() and u.ativo and u.papel = 'colaborador'
  order by u.nome
$$;

-- Limpeza do histórico de localização (LGPD). Agendar com pg_cron, ver README.
create function limpar_localizacoes_antigas() returns int
language sql security definer set search_path = public as $$
  with apagadas as (
    delete from localizacoes l using empresas e
    where e.id = l.empresa_id
      and l.capturado_em < now() - make_interval(days => e.retencao_localizacao_dias)
    returning 1
  )
  select count(*)::int from apagadas
$$;

-- Permissões das funções ------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function minha_empresa, sou_gestor, sou_admin, meus_locais,
  proximas_batidas_permitidas, registrar_batida, enviar_localizacoes,
  painel_colaboradores to authenticated;
revoke execute on function proximas_batidas_permitidas from authenticated;
create function minhas_proximas_batidas() returns tipo_batida[]
language sql stable security definer set search_path = public as $$
  select proximas_batidas_permitidas(auth.uid())
$$;
grant execute on function minhas_proximas_batidas to authenticated;

-- RLS ----------------------------------------------------------------------------

alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table locais enable row level security;
alter table usuario_locais enable row level security;
alter table escalas enable row level security;
alter table dispositivos enable row level security;
alter table batidas enable row level security;
alter table ajustes enable row level security;
alter table localizacoes enable row level security;
alter table alertas enable row level security;

-- empresas: todos da empresa leem; só admin altera
create policy empresa_ler on empresas for select to authenticated
  using (id = minha_empresa());
create policy empresa_alterar on empresas for update to authenticated
  using (id = minha_empresa() and sou_admin())
  with check (id = minha_empresa() and sou_admin());

-- usuarios: cada um se vê; gestores veem a empresa; admin gerencia
create policy usuarios_ler on usuarios for select to authenticated
  using (id = auth.uid() or (empresa_id = minha_empresa() and sou_gestor()));
create policy usuarios_admin on usuarios for all to authenticated
  using (empresa_id = minha_empresa() and sou_admin())
  with check (empresa_id = minha_empresa() and sou_admin());

-- locais
create policy locais_ler on locais for select to authenticated
  using (empresa_id = minha_empresa()
         and (sou_gestor() or exists (select 1 from usuario_locais ul
                                      where ul.local_id = locais.id and ul.usuario_id = auth.uid())));
create policy locais_gestor on locais for all to authenticated
  using (empresa_id = minha_empresa() and sou_gestor())
  with check (empresa_id = minha_empresa() and sou_gestor());

-- vínculos e escalas
create policy usuario_locais_ler on usuario_locais for select to authenticated
  using (usuario_id = auth.uid() or sou_gestor() and exists (
    select 1 from usuarios u where u.id = usuario_id and u.empresa_id = minha_empresa()));
create policy usuario_locais_gestor on usuario_locais for all to authenticated
  using (sou_gestor() and exists (
    select 1 from usuarios u where u.id = usuario_id and u.empresa_id = minha_empresa()))
  with check (sou_gestor()
    and exists (select 1 from usuarios u where u.id = usuario_id and u.empresa_id = minha_empresa())
    and exists (select 1 from locais l where l.id = local_id and l.empresa_id = minha_empresa()));

create policy escalas_ler on escalas for select to authenticated
  using (usuario_id = auth.uid() or sou_gestor() and exists (
    select 1 from usuarios u where u.id = usuario_id and u.empresa_id = minha_empresa()));
create policy escalas_gestor on escalas for all to authenticated
  using (sou_gestor() and exists (
    select 1 from usuarios u where u.id = usuario_id and u.empresa_id = minha_empresa()))
  with check (sou_gestor() and exists (
    select 1 from usuarios u where u.id = usuario_id and u.empresa_id = minha_empresa()));

-- dispositivos
create policy dispositivos_gestor on dispositivos for all to authenticated
  using (empresa_id = minha_empresa() and sou_gestor())
  with check (empresa_id = minha_empresa() and sou_gestor());
create policy dispositivos_proprio on dispositivos for select to authenticated
  using (usuario_id = auth.uid());

-- batidas: inserção só pela função registrar_batida; gestor revisa
create policy batidas_ler on batidas for select to authenticated
  using (usuario_id = auth.uid() or (empresa_id = minha_empresa() and sou_gestor()));
create policy batidas_revisar on batidas for update to authenticated
  using (empresa_id = minha_empresa() and sou_gestor())
  with check (empresa_id = minha_empresa() and sou_gestor());

-- ajustes: colaborador pede; gestor decide
create policy ajustes_ler on ajustes for select to authenticated
  using (usuario_id = auth.uid() or (empresa_id = minha_empresa() and sou_gestor()));
create policy ajustes_pedir on ajustes for insert to authenticated
  with check (empresa_id = minha_empresa() and solicitado_por = auth.uid()
              and status = 'pendente'
              and (usuario_id = auth.uid() or sou_gestor()));
create policy ajustes_decidir on ajustes for update to authenticated
  using (empresa_id = minha_empresa() and sou_gestor())
  with check (empresa_id = minha_empresa() and sou_gestor());

-- localizações: inserção só pela função enviar_localizacoes
create policy localizacoes_ler on localizacoes for select to authenticated
  using (usuario_id = auth.uid() or (empresa_id = minha_empresa() and sou_gestor()));

-- alertas
create policy alertas_gestor on alertas for all to authenticated
  using (empresa_id = minha_empresa() and sou_gestor())
  with check (empresa_id = minha_empresa() and sou_gestor());

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, delete on batidas, localizacoes from authenticated;
revoke update on localizacoes from authenticated;

-- Tempo real para o mapa do painel
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table batidas, localizacoes, alertas;
  end if;
end $$;

-- Cria a empresa e o primeiro admin. Rodar uma vez no SQL Editor do Supabase,
-- depois de criar o usuário em Authentication > Users (ver README).
create function criar_empresa_com_admin(p_email text, p_empresa text, p_cnpj text, p_nome_admin text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_empresa uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Crie antes o usuário % em Authentication > Users', p_email;
  end if;
  insert into empresas (nome, cnpj) values (p_empresa, p_cnpj) returning id into v_empresa;
  insert into usuarios (id, empresa_id, nome, email, papel)
  values (v_user, v_empresa, p_nome_admin, p_email, 'admin');
  return v_empresa;
end $$;
revoke execute on function criar_empresa_com_admin from public, anon, authenticated;
