-- Testes de folgas/ausências (no espelho) e documentos dos colaboradores.
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
  ('00000000-0000-0000-0000-000000000002', 'maria@teste'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@outra');
select criar_empresa_com_admin('admin@teste', 'Empresa Teste', null, 'Admin');
select criar_empresa_com_admin('admin@outra', 'Outra', null, 'Admin Outra');
insert into usuarios (id, empresa_id, nome, papel)
select x.id, e.id, x.nome, 'colaborador' from empresas e,
  (values ('00000000-0000-0000-0000-000000000001'::uuid, 'João'),
          ('00000000-0000-0000-0000-000000000002'::uuid, 'Maria')) x(id, nome)
where e.nome = 'Empresa Teste';
insert into escalas (usuario_id, dia_semana, entrada, saida, intervalo_min)
select '00000000-0000-0000-0000-000000000001', d, '08:00', '17:00', 60 from generate_series(1, 5) d;

-- admin lança: folga em 01/09, férias 02 a 03/09, atestado não abonado em 04/09
select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
insert into ausencias (empresa_id, usuario_id, tipo, inicio, fim, abona, observacao)
values (minha_empresa(), '00000000-0000-0000-0000-000000000001', 'folga', '2026-09-01', '2026-09-01', true, 'Pediu o dia'),
       (minha_empresa(), '00000000-0000-0000-0000-000000000001', 'ferias', '2026-09-02', '2026-09-03', true, null),
       (minha_empresa(), '00000000-0000-0000-0000-000000000001', 'outro', '2026-09-04', '2026-09-04', false, 'Descontar');
select pg_temp.afirmar((select count(*) from ausencias) = 3, 'admin lança ausências');

create temp table e as select * from espelho_ponto('2026-09-01', '2026-09-08', '00000000-0000-0000-0000-000000000001');
select pg_temp.afirmar((select situacao = 'ausencia_folga' and previsto_min = 0 and falta_min = 0 from e where data = '2026-09-01'),
  'folga abonada não gera falta');
select pg_temp.afirmar((select count(*) = 2 from e where situacao = 'ausencia_ferias' and falta_min = 0),
  'férias cobrem todos os dias do período');
select pg_temp.afirmar((select situacao = 'ausencia_outro' and falta_min = 480 from e where data = '2026-09-04'),
  'ausência não abonada aparece com motivo e desconta as horas');
select pg_temp.afirmar((select situacao = 'falta' from e where data = '2026-09-07'),
  'dia sem ausência continua como falta');

-- permissões
select pg_temp.entrar('00000000-0000-0000-0000-000000000001');
select pg_temp.afirmar((select count(*) from ausencias) = 3, 'colaborador vê as próprias ausências');
do $$ begin
  insert into ausencias (empresa_id, usuario_id, inicio, fim)
  values (minha_empresa(), '00000000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-01');
  raise exception 'FALHOU: colaborador lançou ausência';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - colaborador não lança ausência';
end $$;
select pg_temp.entrar('00000000-0000-0000-0000-000000000002');
select pg_temp.afirmar((select count(*) from ausencias) = 0, 'colaborador não vê ausências de outro');
select pg_temp.entrar('00000000-0000-0000-0000-00000000000b');
select pg_temp.afirmar((select count(*) from ausencias) = 0, 'outra empresa não vê as ausências');
do $$ begin
  insert into ausencias (empresa_id, usuario_id, inicio, fim)
  values (minha_empresa(), '00000000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-01');
  raise exception 'FALHOU: lançou ausência para colaborador de outra empresa';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - não lança ausência para colaborador de outra empresa';
end $$;

-- documentos
select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
insert into documentos (empresa_id, usuario_id, nome, categoria, caminho)
select minha_empresa(), '00000000-0000-0000-0000-000000000001', 'Contrato.pdf', 'contrato',
       minha_empresa() || '/00000000-0000-0000-0000-000000000001/x-contrato.pdf';
insert into storage.objects (bucket_id, name)
select 'documentos', minha_empresa() || '/00000000-0000-0000-0000-000000000001/x-contrato.pdf';
select pg_temp.afirmar((select count(*) from documentos) = 1 and (select count(*) from storage.objects) = 1,
  'admin anexa documento');
do $$ begin
  insert into documentos (empresa_id, usuario_id, nome, caminho)
  values (minha_empresa(), '00000000-0000-0000-0000-000000000001', 'x', 'outra/pasta/x.pdf');
  raise exception 'FALHOU: aceitou caminho fora da pasta do colaborador';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - arquivo precisa ficar na pasta da empresa e do colaborador';
end $$;
select pg_temp.entrar('00000000-0000-0000-0000-000000000001');
select pg_temp.afirmar((select count(*) from documentos) = 0 and (select count(*) from storage.objects) = 0,
  'colaborador não vê documentos');
select pg_temp.entrar('00000000-0000-0000-0000-00000000000b');
select pg_temp.afirmar((select count(*) from documentos) = 0 and (select count(*) from storage.objects) = 0,
  'outra empresa não vê documentos');
do $$ begin
  insert into storage.objects (bucket_id, name)
  select 'documentos', (select id from empresas where nome = 'Empresa Teste') || '/00000000-0000-0000-0000-000000000001/y.pdf';
  raise exception 'FALHOU: outra empresa enviou arquivo';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - outra empresa não envia arquivo na pasta alheia';
end $$;
select pg_temp.sair();
