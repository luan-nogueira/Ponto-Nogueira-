export type Papel = "admin" | "gestor" | "colaborador";
export type TipoBatida = "entrada" | "inicio_intervalo" | "fim_intervalo" | "saida";
export type StatusBatida = "valida" | "rejeitada" | "pendente_revisao";

export interface Usuario {
  id: string;
  empresa_id: string;
  nome: string;
  email: string | null;
  cpf: string | null;
  pis: string | null;
  cargo: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Local {
  id: string;
  empresa_id: string;
  nome: string;
  endereco: string | null;
  lat: number;
  lng: number;
  raio_metros: number;
  ativo: boolean;
}

export interface Batida {
  id: string;
  usuario_id: string;
  local_id: string | null;
  tipo: TipoBatida;
  registrado_em: string;
  hora_dispositivo: string | null;
  lat: number;
  lng: number;
  precisao_m: number | null;
  dentro_cerca: boolean;
  distancia_m: number | null;
  mock_location: boolean;
  foto_path: string | null;
  sincronizada_offline: boolean;
  nsr: number | null;
  status: StatusBatida;
  motivo_rejeicao: string | null;
  revisado_em: string | null;
  usuarios?: { nome: string } | null;
  locais?: { nome: string } | null;
}

export interface SituacaoColaborador {
  usuario_id: string;
  nome: string;
  cargo: string | null;
  situacao: "trabalhando" | "intervalo" | "fora_jornada";
  ultima_batida_tipo: TipoBatida | null;
  ultima_batida_em: string | null;
  ultima_batida_local: string | null;
  lat: number | null;
  lng: number | null;
  posicao_em: string | null;
  bateria: number | null;
}

export interface Alerta {
  id: string;
  usuario_id: string | null;
  tipo: "fora_cerca" | "gps_falso" | "sem_sinal" | "atraso" | "falta" | "bateria_baixa";
  detalhes: Record<string, unknown>;
  lido: boolean;
  criado_em: string;
  usuarios?: { nome: string } | null;
}
