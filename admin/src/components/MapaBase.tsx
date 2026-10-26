"use client";

import { useEffect } from "react";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";

export interface Marcador {
  id: string;
  lat: number;
  lng: number;
  cor: string;
  rotulo: string;
  /** Texto dentro do marcador (ex.: iniciais). */
  texto?: string;
  /** Onda pulsando em volta (colaborador ativo). */
  pulsar?: boolean;
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

function icone(m: Marcador) {
  const claro = m.cor === "#ffffff" || m.cor === "#e5e5e5";
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="marcador" style="color:${m.cor}">${m.pulsar ? '<span class="marcador-onda"></span>' : ""}<span class="marcador-bola" style="background:${m.cor};color:${claro ? "#0a0a0a" : "#fff"}">${m.texto ?? ""}</span></div>`,
  });
}

function MarcadorPessoa({ m }: { m: Marcador }) {
  const i = useMemo(() => icone(m), [m.cor, m.texto, m.pulsar]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Marker position={[m.lat, m.lng]} icon={i}>
      <Tooltip direction="top" offset={[0, -18]}>{m.rotulo}</Tooltip>
      {m.detalhe && <Popup>{m.detalhe}</Popup>}
    </Marker>
  );
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
      className={`mapa-pb ${className ?? "h-[480px] w-full rounded-2xl"}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cercas.map((c) => (
        <Circle key={c.id} center={[c.lat, c.lng]} radius={c.raio} pathOptions={{ color: "#0a0a0a", weight: 1.5, dashArray: "4 4", fillColor: "#0a0a0a", fillOpacity: 0.06 }}>
          <Tooltip>{c.nome}</Tooltip>
        </Circle>
      ))}
      {marcadores.map((m) => <MarcadorPessoa key={m.id} m={m} />)}
      {aoClicar && <Clique aoClicar={aoClicar} />}
      {ajustar && <Enquadrar pontos={pontos} />}
      <Recentrar centro={centro} />
    </MapContainer>
  );
}
