"use client";

import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";

export interface Marcador {
  id: string;
  lat: number;
  lng: number;
  cor: string;
  rotulo: string;
  detalhe?: React.ReactNode;
}

export interface Cerca {
  id: string;
  lat: number;
  lng: number;
  raio: number;
  nome: string;
}

interface Props {
  marcadores?: Marcador[];
  cercas?: Cerca[];
  centro?: [number, number];
  zoom?: number;
  ajustar?: boolean;
  aoClicar?: (lat: number, lng: number) => void;
  className?: string;
}

function Clique({ aoClicar }: { aoClicar: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => aoClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Enquadra todos os pontos na primeira vez que aparecem.
function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const mapa = useMap();
  const chave = pontos.length > 0;
  useEffect(() => {
    if (pontos.length === 1) mapa.setView(pontos[0], 16);
    else if (pontos.length > 1) mapa.fitBounds(pontos as LatLngBoundsExpression, { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return null;
}

function Recentrar({ centro }: { centro?: [number, number] }) {
  const mapa = useMap();
  useEffect(() => {
    if (centro) mapa.setView(centro, Math.max(mapa.getZoom(), 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centro?.[0], centro?.[1]]);
  return null;
}

export default function MapaBase({ marcadores = [], cercas = [], centro, zoom = 12, ajustar = true, aoClicar, className }: Props) {
  const pontos: [number, number][] = [
    ...marcadores.map((m) => [m.lat, m.lng] as [number, number]),
    ...cercas.map((c) => [c.lat, c.lng] as [number, number]),
  ];
  return (
    <MapContainer
      center={centro ?? pontos[0] ?? [-23.55, -46.63]}
      zoom={zoom}
      className={className ?? "h-[480px] w-full rounded-lg"}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cercas.map((c) => (
        <Circle key={c.id} center={[c.lat, c.lng]} radius={c.raio} pathOptions={{ color: "#047857", weight: 1, fillOpacity: 0.12 }}>
          <Tooltip>{c.nome}</Tooltip>
        </Circle>
      ))}
      {marcadores.map((m) => (
        <CircleMarker key={m.id} center={[m.lat, m.lng]} radius={9}
          pathOptions={{ color: "#fff", weight: 2, fillColor: m.cor, fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]}>{m.rotulo}</Tooltip>
          {m.detalhe && <Popup>{m.detalhe}</Popup>}
        </CircleMarker>
      ))}
      {aoClicar && <Clique aoClicar={aoClicar} />}
      {ajustar && <Enquadrar pontos={pontos} />}
      <Recentrar centro={centro} />
    </MapContainer>
  );
}
