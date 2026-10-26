-- Ponto: estrutura principal do banco.
-- Coordenadas ficam em colunas lat/lng simples (fáceis de ler e gravar pela API)
-- e a coluna geography correspondente é gerada automaticamente para as consultas
-- espaciais do PostGIS.

create extension if not exists postgis with schema extensions;

create type papel_usuario as enum ('admin', 'gestor', 'colaborador');
create type tipo_batida as enum ('entrada', 'inicio_intervalo', 'fim_intervalo', 'saida');
create type status_batida as enum ('valida', 'rejeitada', 'pendente_revisao');
create type status_ajuste as enum ('pendente', 'aprovado', 'recusado');
create type tipo_alerta as enum ('fora_cerca', 'gps_falso', 'sem_sinal', 'atraso', 'falta', 'bateria_baixa');

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  fuso_horario text not null default 'America/Sao_Paulo',
  -- precisão máxima do GPS (em metros) aceita numa batida
  precisao_max_m int not null default 100,
  -- intervalo de envio da localização durante a jornada (segundos)
  intervalo_rastreio_s int not null default 300,
  -- dias que o histórico de localização é guardado (LGPD)
  retencao_localizacao_dias int not null default 90,
  -- último NSR emitido (número sequencial de registro, Portaria 671/2021)
  ultimo_nsr bigint not null default 0,
  criado_em timestamptz not null default now()
);

create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  empresa_id uuid not null references empresas (id),
  nome text not null,
  email text,
  cpf text,
  pis text,
  cargo text,
  papel papel_usuario not null default 'colaborador',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on usuarios (empresa_id);

create table locais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id),
  nome text not null,
  endereco text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  raio_metros int not null default 150 check (raio_metros between 20 and 5000),
  -- opcional: polígono GeoJSON desenhado no mapa; quando existe, vale no lugar do raio
  poligono_geojson jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  centro extensions.geography(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  poligono extensions.geography(Polygon, 4326)
    generated always as (
      case when poligono_geojson is null then null
      else extensions.st_setsrid(extensions.st_geomfromgeojson(poligono_geojson::text), 4326)::extensions.geography end
    ) stored
);
create index on locais (empresa_id);

create table usuario_locais (
  usuario_id uuid not null references usuarios (id) on delete cascade,
  local_id uuid not null references locais (id) on delete cascade,
  primary key (usuario_id, local_id)
);
create index on usuario_locais (local_id);

create table escalas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  entrada time not null,
  saida time not null,
  intervalo_min int not null default 60,
  tolerancia_min int not null default 10,
  unique (usuario_id, dia_semana)
);

create table dispositivos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios (id) on delete set null,
  empresa_id uuid not null references empresas (id),
  android_id text not null,
  modelo text,
  amapi_device_name text,
  versao_app text,
  bateria smallint,
  ultimo_contato timestamptz,
  unique (empresa_id, android_id)
);

create table batidas (
  id uuid primary key default gen_random_uuid(),
  -- id gerado no celular, garante que uma batida reenviada (offline) não duplica
  id_cliente uuid not null,
  empresa_id uuid not null references empresas (id),
  usuario_id uuid not null references usuarios (id),
  local_id uuid references locais (id),
  tipo tipo_batida not null,
  -- hora oficial: sempre a do servidor
  registrado_em timestamptz not null default now(),
  -- hora informada pelo celular (referência; diferente da oficial quando offline)
  hora_dispositivo timestamptz,
  lat double precision not null,
  lng double precision not null,
  precisao_m real,
  dentro_cerca boolean not null,
  distancia_m real,
  mock_location boolean not null default false,
  foto_path text,
  dispositivo text,
  sincronizada_offline boolean not null default false,
  nsr bigint,
  hash_comprovante text,
  status status_batida not null,
  motivo_rejeicao text,
  revisado_por uuid references usuarios (id),
  revisado_em timestamptz,
  posicao extensions.geography(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  unique (usuario_id, id_cliente),
  unique (empresa_id, nsr)
);
create index on batidas (empresa_id, registrado_em desc);
create index on batidas (usuario_id, registrado_em desc);

create table ajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id),
  usuario_id uuid not null references usuarios (id),
  batida_id uuid references batidas (id),
  tipo tipo_batida not null,
  horario_proposto timestamptz not null,
  justificativa text not null,
  solicitado_por uuid not null references usuarios (id),
  status status_ajuste not null default 'pendente',
  decidido_por uuid references usuarios (id),
  decidido_em timestamptz,
  motivo_decisao text,
  criado_em timestamptz not null default now()
);
create index on ajustes (empresa_id, status);

create table localizacoes (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas (id),
  usuario_id uuid not null references usuarios (id),
  lat double precision not null,
  lng double precision not null,
  precisao_m real,
  velocidade real,
  bateria smallint,
  mock_location boolean not null default false,
  capturado_em timestamptz not null,
  recebido_em timestamptz not null default now(),
  posicao extensions.geography(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored
);
create index on localizacoes (usuario_id, capturado_em desc);
create index on localizacoes (empresa_id, capturado_em desc);

create table alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id),
  usuario_id uuid references usuarios (id),
  tipo tipo_alerta not null,
  detalhes jsonb not null default '{}',
  lido boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on alertas (empresa_id, lido, criado_em desc);

-- Batidas nunca são apagadas nem têm os dados originais alterados (Portaria 671/2021).
-- Só os campos de revisão podem mudar; correções entram pela tabela de ajustes.
create function proteger_batida() returns trigger
language plpgsql as $$
begin
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
  -- uma batida só sai de "pendente_revisao"; válidas e rejeitadas são definitivas
  if new.status is distinct from old.status and old.status <> 'pendente_revisao' then
    raise exception 'Status da batida só pode mudar quando está pendente de revisão';
  end if;
  return new;
end $$;

create trigger batidas_protegidas
  before update or delete on batidas
  for each row execute function proteger_batida();
