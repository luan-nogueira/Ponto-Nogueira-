export type Tema = "claro" | "escuro" | "sistema";
export const CHAVE = "tema";

// Roda antes da página aparecer, para não piscar o tema errado.
export const scriptTema = `(function(){try{var t=localStorage.getItem("${CHAVE}")||"sistema";var e=t==="escuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",e)}catch(_){}})()`;
