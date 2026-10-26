-- Testes das regras de batida e das permissões.
\set ON_ERROR_STOP 1

create function pg_temp.afirmar(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Dados de teste ------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste'),
  ('00000000-0000-0000-0000-000000000001', 'joao@teste'),
  ('00000000-0000-0000-0000-000000000002', 'maria@teste'),
  ('00000000-0000-0000-0000-0000000000b0', 'outra@teste');

select criar_empresa_com_admin('admin@teste', 'Empresa Teste', '12345678000199', 'Admin');
insert into empresas (id, nome) values ('00000000-0000-0000-0000-0000000000e2', 'Outra empresa');
insert into usuarios (id, empresa_id, nome, papel) values
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000e2', 'Outra', 'admin');

insert into usuarios (id, empresa_id, nome, cpf, papel)
select x.id, e.id, x.nome, '11122233344', 'colaborador'
from empresas e,
     (values ('00000000-0000-0000-0000-000000000001'::uuid, 'João'),
             ('00000000-0000-0000-0000-000000000002'::uuid, 'Maria')) x(id, nome)
where e.nome = 'Empresa Teste';

insert into locais (id, empresa_id, nome, lat, lng, raio_metros)
select '00000000-0000-0000-0000-0000000000c1', id, 'Atacadão Centro', -23.5500, -46.6300, 150
from empresas where nome = 'Empresa Teste';
-- local com polígono (quadrado de ~220 m)
insert into locais (id, empresa_id, nome, lat, lng, poligono_geojson)
select '00000000-0000-0000-0000-0000000000c2', id, 'Depósito', -23.6000, -46.7000,
  '{"type":"Polygon","coordinates":[[[-46.701,-23.601],[-46.699,-23.601],[-46.699,-23.599],[-46.701,-23.599],[-46.701,-23.601]]]}'
from empresas where nome = 'Empresa Teste';

insert into usuario_locais values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2');

create function pg_temp.entrar(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', false), set_config('request.jwt.claim.sub', uid, false)
$$;
create function pg_temp.sair() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false)
$$;

-- Cerca virtual -------------------------------------------------------------------
select pg_temp.entrar('00000000-0000-0000-0000-000000000001');

select pg_temp.afirmar(
  (select dentro_cerca and distancia_m between 40 and 60 from meus_locais(-23.55045, -46.6300)),
  'meus_locais: 50 m do centro está dentro do raio de 150 m');

select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'entrada', -23.5590, -46.6300, 10)->>'status') = 'rejeitada',
  'batida a 1 km do local é rejeitada');

select pg_temp.afirmar(
  (select motivo_rejeicao like 'Fora do local de trabalho%' from batidas order by registrado_em desc limit 1),
  'motivo informa que está fora do local');

select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'entrada', -23.5501, -46.6300, 10, true)->>'motivo_rejeicao') = 'Localização falsa detectada',
  'GPS falso é rejeitado');

select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'entrada', -23.5501, -46.6300, 250)->>'status') = 'rejeitada',
  'GPS com precisão ruim (250 m) é rejeitado');

select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'saida', -23.5501, -46.6300, 10)->>'motivo_rejeicao') like 'Batida fora de ordem%',
  'saída sem entrada é rejeitada');

-- Batida válida e idempotência
select pg_temp.afirmar(
  (select (r->>'status') = 'valida' and (r->>'nsr')::int = 1 and length(r->>'hash') = 64
   from registrar_batida('00000000-0000-0000-0000-0000000000f1', 'entrada', -23.5505, -46.6302, 12) r),
  'entrada dentro da cerca é válida, recebe NSR 1 e hash');

select pg_temp.afirmar(
  (registrar_batida('00000000-0000-0000-0000-0000000000f1', 'entrada', -23.5505, -46.6302, 12)->>'nsr')::int = 1
  and (select count(*) from batidas where id_cliente = '00000000-0000-0000-0000-0000000000f1') = 1,
  'reenvio da mesma batida não duplica');

select pg_temp.afirmar(
  minhas_proximas_batidas() = array['inicio_intervalo', 'saida']::tipo_batida[],
  'depois da entrada pode ir para intervalo ou saída');

select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'entrada', -23.5505, -46.6302, 12)->>'status') = 'rejeitada',
  'segunda entrada seguida é rejeitada');

select pg_temp.afirmar(
  (select (r->>'status') = 'pendente_revisao' and (r->>'nsr')::int = 2
   from registrar_batida(gen_random_uuid(), 'inicio_intervalo', -23.5505, -46.6302, 12, false,
                         now() - interval '40 minutes', null, null, true) r),
  'batida feita offline há 40 min fica pendente de revisão');

-- Localização só durante a jornada
select pg_temp.afirmar(
  enviar_localizacoes(jsonb_build_array(jsonb_build_object(
    'lat', -23.551, 'lng', -46.631, 'capturado_em', now()))) = 1,
  'localização é gravada durante a jornada');

select pg_temp.afirmar(
  (select count(*) from alertas) = 0, 'colaborador não vê alertas');

-- Polígono
select pg_temp.entrar('00000000-0000-0000-0000-000000000002');
select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'entrada', -23.6005, -46.7005, 8)->>'status') = 'valida',
  'dentro do polígono é válida');
select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'saida', -23.6015, -46.7000, 8)->>'status') = 'rejeitada',
  'fora do polígono (55 m) é rejeitada');
select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'saida', -23.5505, -46.6302, 8)->>'status') = 'rejeitada',
  'Maria não pode bater no Atacadão, que não é o local dela');
select pg_temp.afirmar(
  (registrar_batida(gen_random_uuid(), 'saida', -23.6005, -46.7005, 8)->>'nsr')::int = 4,
  'saída válida recebe o próximo NSR da empresa');
select pg_temp.afirmar(
  enviar_localizacoes('[{"lat":-23.6,"lng":-46.7,"capturado_em":"2026-01-01T00:00:00Z"}]'::jsonb
                      || jsonb_build_array(jsonb_build_object('lat', -23.6, 'lng', -46.7, 'capturado_em', now()))) = 0,
  'depois da saída nenhuma localização é gravada');

-- Permissões ----------------------------------------------------------------------
select pg_temp.afirmar(
  (select count(*) from batidas) = 4 and (select count(distinct usuario_id) from batidas) = 1,
  'colaborador só vê as próprias batidas');

select pg_temp.afirmar((select count(*) from painel_colaboradores()) = 0,
  'colaborador não acessa o painel');

do $$ begin
  insert into batidas (id_cliente, empresa_id, usuario_id, tipo, lat, lng, dentro_cerca, status)
  select gen_random_uuid(), empresa_id, id, 'entrada', 0, 0, true, 'valida' from usuarios where id = auth.uid();
  raise exception 'FALHOU: colaborador inseriu batida direto na tabela';
exception when insufficient_privilege then raise notice 'ok - colaborador não insere batida direto na tabela';
end $$;

select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
select pg_temp.afirmar((select count(*) from batidas) = 11, 'admin vê todas as batidas da empresa');
select pg_temp.afirmar((select count(*) from alertas) = 4, 'admin vê alertas de fora da cerca e GPS falso');
select pg_temp.afirmar(
  (select situacao from painel_colaboradores() where nome = 'João') = 'intervalo'
  and (select situacao from painel_colaboradores() where nome = 'Maria') = 'fora_jornada',
  'painel mostra a situação de cada colaborador');
select pg_temp.afirmar(
  (select lat from painel_colaboradores() where nome = 'João') = -23.551,
  'painel usa a última localização enviada');

do $$ begin
  update batidas set registrado_em = now() - interval '1 hour' where nsr = 1;
  raise exception 'FALHOU: admin alterou a hora da batida';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - hora da batida não pode ser alterada';
end $$;

do $$ begin
  delete from batidas where nsr = 1;
  raise exception 'FALHOU: admin apagou batida';
exception when insufficient_privilege then raise notice 'ok - batida não pode ser apagada';
end $$;

update batidas set status = 'valida', revisado_por = auth.uid(), revisado_em = now()
where status = 'pendente_revisao';
select pg_temp.afirmar((select count(*) from batidas where status = 'pendente_revisao') = 0,
  'gestor aprova batida pendente');

select pg_temp.entrar('00000000-0000-0000-0000-0000000000b0');
select pg_temp.afirmar((select count(*) from batidas) = 0 and (select count(*) from usuarios) = 1,
  'admin de outra empresa não vê nada desta');

select pg_temp.sair();
