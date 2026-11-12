"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Download, MessageCircle } from "lucide-react";

// Link fixo do APK; o CI publica cada versão nova no mesmo endereço.
const apk = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/app/ponto.apk`;

const passos = [
  "Toque em Baixar o aplicativo.",
  "Abra o arquivo baixado. Se o celular pedir, permita instalar apps desta fonte.",
  "Toque em Instalar e depois em Abrir.",
  "Entre com o e-mail e a senha que a empresa passou e aceite os pedidos de localização e câmera.",
];

/** Página pública para o colaborador baixar o app (o gestor manda este link). */
export default function PaginaBaixar() {
  const [pagina, setPagina] = useState("");
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setPagina(window.location.href), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pagina);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Baixe o app de ponto da empresa: ${pagina}`)}`;

  return (
    <div className="min-h-dvh bg-papel">
      <section className="sempre-escuro relative overflow-hidden rounded-b-[2rem] bg-tinta px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-white">
        <motion.div
          className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative mx-auto max-w-md">
          <span className="flex items-center gap-2 text-sm text-neutral-400"><span className="h-2 w-2 rounded-full bg-white" /> Ponto</span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Aplicativo de ponto</h1>
          <p className="mt-2 text-neutral-400">Para Android. Bata o ponto com foto e localização, direto do celular.</p>
          <motion.a
            href={apk}
            whileTap={{ scale: 0.97 }}
            className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-semibold text-tinta shadow-xl"
          >
            <Download size={20} /> Baixar o aplicativo
          </motion.a>
        </div>
      </section>

      <main className="mx-auto max-w-md space-y-6 px-6 py-8">
        <ol className="escalonado space-y-3">
          {passos.map((p, i) => (
            <li key={i} className="cartao flex gap-4 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tinta text-sm font-semibold text-white">{i + 1}</span>
              <span className="pt-1 text-sm leading-relaxed">{p}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs leading-relaxed text-suave">
          A localização só é enviada durante a jornada, entre a entrada e a saída. Para atualizar o app, baixe de novo por este mesmo link.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="botao-sec" onClick={copiar}>{copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? "Copiado" : "Copiar link"}</button>
          <a className="botao-sec" href={whatsapp}><MessageCircle size={16} /> WhatsApp</a>
        </div>
      </main>
    </div>
  );
}
