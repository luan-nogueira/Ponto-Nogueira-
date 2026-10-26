import type { MetadataRoute } from "next";

// Permite "Adicionar à tela inicial" no celular e abrir o painel como um app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ponto · Painel",
    short_name: "Ponto",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "pt-BR",
  };
}
