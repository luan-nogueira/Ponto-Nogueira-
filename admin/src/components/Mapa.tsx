"use client";

import dynamic from "next/dynamic";

// Leaflet só funciona no navegador.
const Mapa = dynamic(() => import("./MapaBase"), {
  ssr: false,
  loading: () => <div className="esqueleto h-[480px] w-full" />,
});

export default Mapa;
export type { Marcador, Cerca } from "./MapaBase";
