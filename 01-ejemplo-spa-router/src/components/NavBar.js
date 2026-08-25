// Un "componente" en este contexto vanilla es simplemente una función que
// devuelve un fragmento de HTML (string) o un nodo del DOM. No hay JSX,
// pero la idea de "una función = una pieza de UI reutilizable" es la misma
// que en React.

export default function renderActiveLink(path) {
  document.querySelectorAll("nav a[data-link]").forEach((link) => {
    const linkPath = new URL(link.href).pathname;
    link.classList.toggle("active", linkPath === path);
  });
}
