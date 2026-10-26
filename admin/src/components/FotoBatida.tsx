"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Mostra a selfie da batida (bucket privado, link temporário).
export function FotoBatida({ caminho, tamanho = 48 }: { caminho: string | null; tamanho?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!caminho) return;
    supabase.storage.from("fotos-ponto").createSignedUrl(caminho, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [caminho]);
  if (!caminho) return <span style={{ width: tamanho, height: tamanho }} className="flex items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-suave">sem foto</span>;
  if (!url) return <div style={{ width: tamanho, height: tamanho }} className="esqueleto" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto da batida" width={tamanho} height={tamanho} className="rounded-lg object-cover grayscale transition duration-300 hover:grayscale-0 hover:scale-105" style={{ width: tamanho, height: tamanho }} />
    </a>
  );
}
