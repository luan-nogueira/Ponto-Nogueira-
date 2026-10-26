import type { Alerta, StatusBatida, TipoBatida } from "./tipos";

export const nomeTipo: Record<TipoBatida, string> = {
  entrada: "Entrada",
  inicio_intervalo: "Início do intervalo",
  fim_intervalo: "Fim do intervalo",
  saida: "Saída",
};

export const nomeStatus: Record<StatusBatida, string> = {
  valida: "Válida",
  rejeitada: "Recusada",
  pendente_revisao: "Revisar",
};

export const corStatus: Record<StatusBatida, string> = {
  valida: "bg-emerald-100 text-emerald-800",
  rejeitada: "bg-red-100 text-red-800",
  pendente_revisao: "bg-amber-100 text-amber-800",
};

export const nomeAlerta: Record<Alerta["tipo"], string> = {
  fora_cerca: "Tentou bater fora do local",
  gps_falso: "GPS falso",
  sem_sinal: "Sem sinal",
  atraso: "Atraso",
  falta: "Falta",
  bateria_baixa: "Bateria baixa",
};

const fuso = "America/Sao_Paulo";

export function dataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" });
}

export function hora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
}

export function haQuanto(iso: string | null | undefined) {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : dataHora(iso);
}

// Início do dia de hoje no fuso de Brasília, em ISO.
export function inicioDoDia(data = new Date()) {
  const dia = data.toLocaleDateString("en-CA", { timeZone: fuso });
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}
