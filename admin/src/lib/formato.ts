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

/** Minutos em horas ("8:00", "-1:30"). Zero vira "—" quando `traco` é true. */
export function horas(min: number, traco = false) {
  if (traco && min === 0) return "—";
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  return `${sinal}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** Primeiro e último dia do mês ("2026-10" → ["2026-10-01", "2026-10-31"]). */
export function limitesDoMes(mes: string): [string, string] {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, "0")}`];
}

export function nomeDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** "2026-10-05" → "05/10 seg" */
export function diaCurto(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return { dia: `${data.slice(8, 10)}/${data.slice(5, 7)}`, semana };
}

/** Feriados nacionais do ano, incluindo os móveis (Carnaval, Sexta-feira Santa, Corpus Christi). */
export function feriadosNacionais(ano: number): { data: string; nome: string }[] {
  // Páscoa pelo algoritmo de Meeus/Jones/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = Date.UTC(ano, mes - 1, dia);
  const mover = (dias: number) => new Date(pascoa + dias * 86400000).toISOString().slice(0, 10);
  const fixo = (md: string) => `${ano}-${md}`;
  return [
    { data: fixo("01-01"), nome: "Confraternização Universal" },
    { data: mover(-48), nome: "Carnaval" },
    { data: mover(-47), nome: "Carnaval" },
    { data: mover(-2), nome: "Sexta-feira Santa" },
    { data: fixo("04-21"), nome: "Tiradentes" },
    { data: fixo("05-01"), nome: "Dia do Trabalho" },
    { data: mover(60), nome: "Corpus Christi" },
    { data: fixo("09-07"), nome: "Independência do Brasil" },
    { data: fixo("10-12"), nome: "Nossa Senhora Aparecida" },
    { data: fixo("11-02"), nome: "Finados" },
    { data: fixo("11-15"), nome: "Proclamação da República" },
    { data: fixo("11-20"), nome: "Dia da Consciência Negra" },
    { data: fixo("12-25"), nome: "Natal" },
  ];
}
