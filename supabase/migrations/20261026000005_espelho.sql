-- Espelho de ponto: horas trabalhadas, extras, faltas, atrasos e adicional noturno por dia.

-- Feriados da empresa (contam como dia sem jornada prevista; trabalho neles é extra 100%)
create table feriados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  data date not null,
  nome text not null,
  unique (empresa_id, data)
);

alter table feriados enable row level security;
create policy feriados_ler on feriados for select to authenticated
  using (empresa_id = minha_empresa());
create policy feriados_gestor on feriados for all to authenticated
  using (empresa_id = minha_empresa() and sou_gestor())
  with check (empresa_id = minha_empresa() and sou_gestor());

-- Minutos de um período que caem entre 22h e 5h (horário local da empresa).
create function minutos_noturnos(p_de timestamptz, p_ate timestamptz, p_fuso text) returns int
language plpgsql stable as $$
declare
  v_total numeric := 0;
  v_dia date;
  v_ini timestamptz;
  v_fim timestamptz;
begin
  if p_ate <= p_de then return 0; end if;
  for v_dia in
    select generate_series((p_de at time zone p_fuso)::date - 1, (p_ate at time zone p_fuso)::date, interval '1 day')::date
  loop
    v_ini := (v_dia + time '22:00') at time zone p_fuso;
    v_fim := (v_dia + 1 + time '05:00') at time zone p_fuso;
    v_total := v_total + greatest(0, extract(epoch from least(p_ate, v_fim) - greatest(p_de, v_ini)));
  end loop;
  return round(v_total / 60);
end $$;

-- Uma linha por colaborador e dia do período. Sem p_usuario, traz todos (só gestor).
-- Regras:
--  * conta batidas válidas e em revisão (recusadas não contam); ajuste aprovado entra
--    como marcação e, se apontar para uma batida, a substitui;
--  * jornada prevista vem da escala do dia da semana, menos o intervalo; feriado não tem jornada;
--  * variação de até tolerancia_min no dia (padrão 10, CLT art. 58 §1º) não gera extra nem falta;
--  * extra em domingo ou feriado é 100%, nos demais dias 50%;
--  * dias futuros e o dia de hoje em andamento não geram falta.
create function espelho_ponto(p_inicio date, p_fim date, p_usuario uuid default null)
returns table (
  usuario_id uuid,
  nome text,
  data date,
  situacao text,
  marcacoes jsonb,
  previsto_min int,
  trabalhado_min int,
  intervalo_min int,
  noturno_min int,
  extra50_min int,
  extra100_min int,
  falta_min int,
  atraso_min int
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_empresa uuid := minha_empresa();
  v_fuso text;
  v_hoje date;
  u record;
  m record;
  e record;
  v_dia date;
  v_feriado boolean;
  v_aberto timestamptz;
  v_ult_pausa timestamptz;
  v_primeira timestamptz;
  v_incompleto boolean;
  v_pendente boolean;
  v_trab numeric;
  v_interv numeric;
  v_not int;
  v_prev int;
  v_saldo int;
  v_marc jsonb;
begin
  if v_empresa is null then raise exception 'Sem acesso'; end if;
  if (p_usuario is null or p_usuario <> auth.uid()) and not sou_gestor() then
    raise exception 'Sem acesso';
  end if;
  if p_fim < p_inicio or p_fim - p_inicio > 62 then
    raise exception 'Escolha um período de até 62 dias';
  end if;

  select fuso_horario into v_fuso from empresas where id = v_empresa;
  v_hoje := (now() at time zone v_fuso)::date;

  for u in
    select us.id, us.nome from usuarios us
    where us.empresa_id = v_empresa
      and (us.id = p_usuario or (p_usuario is null and (
        (us.ativo and us.papel = 'colaborador')
        or exists (select 1 from batidas b where b.usuario_id = us.id
                   and b.registrado_em >= (p_inicio::timestamp at time zone v_fuso)
                   and b.registrado_em < ((p_fim + 1)::timestamp at time zone v_fuso)))))
    order by us.nome
  loop
    for v_dia in select generate_series(p_inicio, p_fim, interval '1 day')::date loop
      select es.* into e from escalas es
      where es.usuario_id = u.id and es.dia_semana = extract(dow from v_dia);
      v_feriado := exists (select 1 from feriados f where f.empresa_id = v_empresa and f.data = v_dia);

      v_aberto := null; v_ult_pausa := null; v_primeira := null;
      v_incompleto := false; v_pendente := false;
      v_trab := 0; v_interv := 0; v_not := 0; v_marc := '[]'::jsonb;

      for m in
        select b.tipo, b.registrado_em as em, b.status::text as origem
        from batidas b
        where b.usuario_id = u.id and b.status <> 'rejeitada'
          and b.registrado_em >= (v_dia::timestamp at time zone v_fuso)
          and b.registrado_em < ((v_dia + 1)::timestamp at time zone v_fuso)
          and not exists (select 1 from ajustes a where a.batida_id = b.id and a.status = 'aprovado')
        union all
        select a.tipo, a.horario_proposto, 'ajuste'
        from ajustes a
        where a.usuario_id = u.id and a.status = 'aprovado'
          and a.horario_proposto >= (v_dia::timestamp at time zone v_fuso)
          and a.horario_proposto < ((v_dia + 1)::timestamp at time zone v_fuso)
        order by 2
      loop
        v_marc := v_marc || jsonb_build_object(
          'tipo', m.tipo, 'hora', to_char(m.em at time zone v_fuso, 'HH24:MI'), 'origem', m.origem);
        if m.origem = 'pendente_revisao' then v_pendente := true; end if;

        if m.tipo in ('entrada', 'fim_intervalo') then
          if v_aberto is not null then v_incompleto := true; end if;
          if m.tipo = 'entrada' and v_primeira is null then v_primeira := m.em; end if;
          if m.tipo = 'fim_intervalo' and v_ult_pausa is not null then
            v_interv := v_interv + extract(epoch from m.em - v_ult_pausa) / 60;
          end if;
          v_aberto := m.em;
        else
          if v_aberto is null then
            v_incompleto := true;
          else
            v_trab := v_trab + extract(epoch from m.em - v_aberto) / 60;
            v_not := v_not + minutos_noturnos(v_aberto, m.em, v_fuso);
          end if;
          v_aberto := null;
          v_ult_pausa := case when m.tipo = 'inicio_intervalo' then m.em end;
        end if;
      end loop;

      -- jornada prevista do dia
      if e.usuario_id is not null and not v_feriado then
        v_prev := (extract(epoch from e.saida - e.entrada) / 60)::int;
        if v_prev <= 0 then v_prev := v_prev + 1440; end if;
        v_prev := greatest(0, v_prev - e.intervalo_min);
      else
        v_prev := 0;
      end if;

      usuario_id := u.id;
      nome := u.nome;
      data := v_dia;
      marcacoes := v_marc;
      previsto_min := v_prev;
      trabalhado_min := round(v_trab);
      intervalo_min := round(v_interv);
      noturno_min := v_not;
      extra50_min := 0; extra100_min := 0; falta_min := 0; atraso_min := 0;

      if v_dia > v_hoje then
        situacao := 'futuro';
      elsif v_dia = v_hoje and (v_aberto is not null or jsonb_array_length(v_marc) = 0) then
        situacao := 'em_andamento';
      else
        v_saldo := trabalhado_min - v_prev;
        if abs(v_saldo) <= coalesce(e.tolerancia_min, 10) then v_saldo := 0; end if;
        if v_saldo > 0 then
          if v_feriado or extract(dow from v_dia) = 0 then extra100_min := v_saldo; else extra50_min := v_saldo; end if;
        else
          falta_min := -v_saldo;
        end if;
        if v_primeira is not null and e.usuario_id is not null and not v_feriado then
          atraso_min := greatest(0, (extract(epoch from (v_primeira at time zone v_fuso)::time - e.entrada) / 60)::int);
          if atraso_min <= coalesce(e.tolerancia_min, 10) then atraso_min := 0; end if;
        end if;

        situacao := case
          when jsonb_array_length(v_marc) = 0 and v_prev > 0 then 'falta'
          when jsonb_array_length(v_marc) = 0 and v_feriado then 'feriado'
          when jsonb_array_length(v_marc) = 0 then 'folga'
          when v_incompleto or v_aberto is not null then 'incompleto'
          when v_pendente then 'em_revisao'
          else 'normal'
        end;
      end if;
      return next;
    end loop;
  end loop;
end $$;

revoke execute on function espelho_ponto(date, date, uuid) from public, anon;
grant execute on function espelho_ponto(date, date, uuid) to authenticated;
