-- Testes da exclusão de registros pelo administrador.
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
create function pg_temp.falha(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FALHOU: %', msg;
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - %', msg;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste'),
  ('00000000-0000-0000-0000-00000000000c', 'gestor@teste'),
  ('00000000-0000-0000-0000-000000000001', 'joao@teste'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@outra');
select criar_empresa_com_admin('admin@teste', 'Empresa Teste', null, 'Admin');
select criar_empresa_com_admin('admin@outra', 'Outra', null, 'Admin Outra');
insert into usuarios (id, empresa_id, nome, papel)
select x.id, e.id, x.nome, x.papel::papel_usuario from empresas e,
  (values ('00000000-0000-0000-0000-000000000001'::uuid, 'João', 'colaborador'),
          ('00000000-0000-0000-0000-00000000000c'::uuid, 'Gestor', 'gestor')) x(id, nome, papel)
where e.nome = 'Empresa Teste';
insert into locais (id, empresa_id, nome, lat, lng)
select '10000000-0000-0000-0000-000000000001', id, 'Loja', 0, 0 from empresas where nome = 'Empresa Teste';
insert into batidas (id, id_cliente, empresa_id, usuario_id, local_id, tipo, lat, lng, dentro_cerca, status, foto_path)
select ('20000000-0000-0000-0000-00000000000' || n)::uuid, gen_random_uuid(), empresa_id, id,
       '10000000-0000-0000-0000-000000000001', 'entrada', 0, 0, true, 'valida', id || '/f' || n || '.jpg'
from usuarios, generate_series(1, 3) n where id = '00000000-0000-0000-0000-000000000001';
insert into ajustes (empresa_id, usuario_id, batida_id, tipo, horario_proposto, justificativa, solicitado_por)
select empresa_id, id, '20000000-0000-0000-0000-000000000001', 'entrada', now(), 'teste', id
from usuarios where id = '00000000-0000-0000-0000-000000000001';
insert into localizacoes (empresa_id, usuario_id, lat, lng, capturado_em)
select empresa_id, id, 0, 0, now() from usuarios where id = '00000000-0000-0000-0000-000000000001';

select pg_temp.falha('delete from batidas', 'batida continua sem poder ser apagada diretamente');

-- gestor e colaborador não excluem
select pg_temp.entrar('00000000-0000-0000-0000-00000000000c');
select pg_temp.falha($$select excluir_batidas(array['20000000-0000-0000-0000-000000000001']::uuid[])$$, 'gestor não exclui batidas');
select pg_temp.entrar('00000000-0000-0000-0000-00000000000b');
select excluir_batidas(array['20000000-0000-0000-0000-000000000001']::uuid[]);
select excluir_local('10000000-0000-0000-0000-000000000001');
select pg_temp.falha($$select excluir_dados_colaborador('00000000-0000-0000-0000-000000000001')$$, 'admin de outra empresa não exclui colaborador');
select pg_temp.sair();
select pg_temp.afirmar((select count(*) from batidas) = 3 and (select count(*) from locais) = 1,
  'admin de outra empresa não apaga batidas nem locais');

-- admin
select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
select pg_temp.afirmar((select array_agg(f) from excluir_batidas(array['20000000-0000-0000-0000-000000000001']::uuid[]) f)
  = array['00000000-0000-0000-0000-000000000001/f1.jpg'], 'admin exclui batida e recebe a foto para apagar');
select pg_temp.sair();
select pg_temp.afirmar((select count(*) from batidas) = 2 and (select count(*) from ajustes) = 0,
  'batida e o ajuste ligado a ela foram apagados');
select pg_temp.falha('delete from batidas', 'proteção volta depois da exclusão');

select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
select excluir_local('10000000-0000-0000-0000-000000000001');
select pg_temp.sair();
select pg_temp.afirmar((select count(*) from locais) = 0 and (select count(*) from batidas where local_id is null) = 2,
  'local excluído; batidas ficam, sem local');

select pg_temp.entrar('00000000-0000-0000-0000-00000000000a');
select pg_temp.falha($$select excluir_dados_colaborador('00000000-0000-0000-0000-00000000000a')$$, 'admin não exclui a si mesmo');
select excluir_dados_colaborador('00000000-0000-0000-0000-000000000001');
select pg_temp.sair();
select pg_temp.afirmar((select count(*) from batidas) = 0 and (select count(*) from localizacoes) = 0,
  'dados do colaborador apagados');
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
select pg_temp.afirmar(not exists (select 1 from usuarios where id = '00000000-0000-0000-0000-000000000001'),
  'login apagado leva o perfil junto');
