import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Chama a edge function de gerenciamento de contas e devolve a mensagem de erro, se houver.
export async function gerenciarColaborador(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("colaboradores", { body: corpo });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro ?? error.message);
  }
  return data;
}

// Chama a edge function dos celulares da empresa (Google Android Management).
export async function celulares<T = Record<string, unknown>>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("celulares", { body: corpo });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro ?? error.message);
  }
  return data as T;
}
