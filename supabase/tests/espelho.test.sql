-- Testes do espelho de ponto (horas, extras, faltas, adicional noturno).
\set ON_ERROR_STOP 1

create function pg_temp.afirmar(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function pg_temp.entrar(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', false), set_config('request.jwt.claim.sub', uid, false)
$$;
create function pg_temp.sair() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false)
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste'),
  ('00000000-0000-0000-0000-000000000001', 'joao@teste'),
  ('00000000-0000-0000-0000-000000000002', 'maria@teste');
select criar_empresa_com_admin('admin@teste', 'Empresa Teste', null, 'Admin');
insert into usuarios (id, empresa_id, nome, papel)
select x.id, e.id, x.nome, 'colaborador' from empresas e,
  (values ('00000000-0000-0000-0000-000000000001'::uuid, 'João'),
          ('00000000-0000-0000-0000-000000000002'::uuid, 'Maria')) x(id, nome);

-- João: segunda a sexta, 08:00–17:00 com 1 h de intervalo (8 h por dia)
insert into escalas (usuario_id, dia_semana, entrada, saida, intervalo_min)
select '00000000-0000-0000-0000-000000000001', d, '08:00', '17:00', 60 from generate_series(1, 5) d;
insert into feriados (empresa_id, data, nome) select id, '2026-09-07', 'Independência' from empresas;

-- batidas de setembro/2026 (horário de Brasília)
create function pg_temp.bater(dia text, hora text, t tipo_batida, st status_batida default 'valida') returns void
language sql as $$
  insert into batidas (id_cliente, empresa_id, usuario_id, tipo, registrado_em, lat, lng, dentro_cerca, status)
  select gen_random_uuid(), empresa_id, id, t, (dia || ' ' || hora)::timestamp at time zone 'America/Sao_Paulo', 0, 0, true, st
  from usuarios where id = '00000000-0000-0000-0000-000000000001'
$$;
-- 01/09 (terça): jornada exata
select pg_temp.bater('2026-09-01', '08:00', 'entrada'), pg_temp.bater('2026-09-01', '12:00', 'inicio_intervalo'),
       pg_temp.bater('2026-09-01', '13:00', 'fim_intervalo'), pg_temp.bater('2026-09-01', '17:00', 'saida');
-- 02/09: 5 min de atraso e saiu 3 min antes (dentro da tolerância)
select pg_temp.bater('2026-09-02', '08:05', 'entrada'), pg_temp.bater('2026-09-02', '12:00', 'inicio_intervalo'),
       pg_temp.bater('2026-09-02', '13:00', 'fim_intervalo'), pg_temp.bater('2026-09-02', '16:57', 'saida');
-- 03/09: chegou 08:30 e saiu 19:00 (2 h extras menos 30 min de atraso = 1h30)
select pg_temp.bater('2026-09-03', '08:30', 'entrada'), pg_temp.bater('2026-09-03', '12:00', 'inicio_intervalo'),
       pg_temp.bater('2026-09-03', '13:00', 'fim_intervalo'), pg_temp.bater('2026-09-03', '19:00', 'saida');
-- 04/09: não veio (falta)
-- 06/09 (domingo): trabalhou 4 h, extra 100%
select pg_temp.bater('2026-09-06', '08:00', 'entrada'), pg_temp.bater('2026-09-06', '12:00', 'saida');
-- 07/09 (feriado, segunda): trabalhou 2 h
select pg_temp.bater('2026-09-07', '09:00', 'entrada'), pg_temp.bater('2026-09-07', '11:00', 'saida');
-- 08/09: só bateu entrada
select pg_temp.bater('2026-09-08', '08:00', 'entrada');
-- 09/09: entrada recusada e corrigida por ajuste aprovado; saída às 23:00 (1 h noturna)
select pg_temp.bater('2026-09-09', '10:00', 'entrada', 'rejeitada'),
       pg_temp.bater('2026-09-09', '23:00', 'saida');
insert into ajustes (empresa_id, usuario_id, tipo, horario_proposto, justificativa, solicitado_por, status)
select empresa_id, id, 'entrada', '2026-09-09 14:00'::timestamp at time zone 'America/Sao_Paulo', 'GPS falhou', id, 'aprovado'
from usuarios where id = '00000000-0000-0000-0000-000000000001';

select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
create temp table e as select * from espelho_ponto('2026-09-01', '2026-09-10', '00000000-0000-0000-0000-000000000001');

select pg_temp.afirmar((select count(*) from e) = 10, 'uma linha por dia do período');
select pg_temp.afirmar((select trabalhado_min = 480 and intervalo_min = 60 and extra50_min = 0 and falta_min = 0 and situacao = 'normal'
  from e where data = '2026-09-01'), 'jornada exata: 8 h, sem extra nem falta');
select pg_temp.afirmar((select trabalhado_min = 472 and falta_min = 0 and atraso_min = 0
  from e where data = '2026-09-02'), 'variação de até 10 min no dia é tolerada');
select pg_temp.afirmar((select trabalhado_min = 570 and extra50_min = 90 and atraso_min = 30
  from e where data = '2026-09-03'), 'extra 50% e atraso calculados');
select pg_temp.afirmar((select situacao = 'falta' and falta_min = 480 from e where data = '2026-09-04'),
  'dia sem batida com jornada prevista é falta');
select pg_temp.afirmar((select situacao = 'folga' and falta_min = 0 from e where data = '2026-09-05'),
  'sábado sem escala é folga');
select pg_temp.afirmar((select extra100_min = 240 and extra50_min = 0 from e where data = '2026-09-06'),
  'domingo trabalhado é extra 100%');
select pg_temp.afirmar((select previsto_min = 0 and extra100_min = 120 from e where data = '2026-09-07'),
  'feriado trabalhado é extra 100%');
select pg_temp.afirmar((select situacao = 'incompleto' and trabalhado_min = 0 from e where data = '2026-09-08'),
  'dia sem saída fica incompleto');
select pg_temp.afirmar((select trabalhado_min = 540 and noturno_min = 60 and jsonb_array_length(marcacoes) = 2
  and marcacoes -> 0 ->> 'origem' = 'ajuste' from e where data = '2026-09-09'),
  'ajuste aprovado conta, batida recusada não, e adicional noturno após 22 h');

-- todos os colaboradores
select pg_temp.afirmar((select count(distinct usuario_id) from espelho_ponto('2026-09-01', '2026-09-10')) = 2,
  'sem colaborador, traz todos da empresa');

-- permissões
select pg_temp.entrar('00000000-0000-0000-0000-000000000002');
select pg_temp.afirmar((select count(*) from espelho_ponto('2026-09-01', '2026-09-02', '00000000-0000-0000-0000-000000000002')) = 2,
  'colaborador vê o próprio espelho');
do $$ begin
  perform espelho_ponto('2026-09-01', '2026-09-02', '00000000-0000-0000-0000-000000000001');
  raise exception 'FALHOU: colaborador viu espelho de outro';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - colaborador não vê espelho de outro';
end $$;
do $$ begin
  perform espelho_ponto('2026-01-01', '2026-12-31', '00000000-0000-0000-0000-000000000002');
  raise exception 'FALHOU: aceitou período longo';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - período limitado a 62 dias';
end $$;
select pg_temp.sair();
