-- Dados de exemplo para desenvolvimento local (supabase db reset).
-- Senha de todos: ponto123
do $$
declare
  v_empresa uuid;
  c record;
begin
  for c in select * from (values
    ('10000000-0000-0000-0000-00000000000a'::uuid, 'admin@ponto.dev', 'Carlos (Dono)', 'admin'::papel_usuario, null::text),
    ('10000000-0000-0000-0000-000000000001'::uuid, 'joao@ponto.dev', 'João Silva', 'colaborador', '12345678901'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'maria@ponto.dev', 'Maria Souza', 'colaborador', '23456789012'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'pedro@ponto.dev', 'Pedro Santos', 'colaborador', '34567890123')
  ) x(id, email, nome, papel, cpf) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', c.id, 'authenticated', 'authenticated', c.email,
            extensions.crypt('ponto123', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), c.id, c.id::text, jsonb_build_object('sub', c.id::text, 'email', c.email),
            'email', now(), now(), now());
  end loop;

  v_empresa := criar_empresa_com_admin('admin@ponto.dev', 'Empresa Exemplo Ltda', '12345678000199', 'Carlos (Dono)');

  insert into usuarios (id, empresa_id, nome, email, cpf, pis, cargo, papel)
  select id, v_empresa, nome, email, cpf, null, 'Repositor', 'colaborador'
  from (values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'João Silva', 'joao@ponto.dev', '12345678901'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'Maria Souza', 'maria@ponto.dev', '23456789012'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'Pedro Santos', 'pedro@ponto.dev', '34567890123')
  ) x(id, nome, email, cpf);

  insert into locais (id, empresa_id, nome, endereco, lat, lng, raio_metros) values
    ('20000000-0000-0000-0000-000000000001', v_empresa, 'Atacadão (exemplo)', 'Av. Exemplo, 1000 - São Paulo/SP', -23.5275, -46.6789, 150),
    ('20000000-0000-0000-0000-000000000002', v_empresa, 'Depósito (exemplo)', 'Rua Exemplo, 50 - São Paulo/SP', -23.5615, -46.6560, 100);

  insert into usuario_locais values
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002');

  insert into escalas (usuario_id, dia_semana, entrada, saida, intervalo_min)
  select u.id, d, '08:00', '17:00', 60
  from usuarios u, generate_series(1, 5) d
  where u.empresa_id = v_empresa and u.papel = 'colaborador';
end $$;
