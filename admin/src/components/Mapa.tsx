"use client";

import dynamic from "next/dynamic";

// Leaflet só funciona no navegador.
const Mapa = dynamic(() => import("./MapaBase"), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full animate-pulse rounded-lg bg-gray-100" />,
});

export default Mapa;
export type { Marcador, Cerca } from "./MapaBase";
