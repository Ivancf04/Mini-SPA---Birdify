// ── EXPORTACIÓN NOMBRADA ───────────────────────────────────────────────
// Podemos exportar tantas funciones/constantes como queramos desde un mismo
// archivo. Al importarlas, el nombre debe coincidir (o usar "as" para alias)
// y van entre llaves { }.

export function formatDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(date);
}

export function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const APP_VERSION = "1.0.0";
