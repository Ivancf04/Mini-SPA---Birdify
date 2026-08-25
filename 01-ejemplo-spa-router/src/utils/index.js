// ── RE-EXPORTACIÓN (barrel file) ───────────────────────────────────────
// Este archivo no define nada nuevo: centraliza y re-expone lo que ya
// exportan otros módulos de la carpeta "utils". Así, el resto de la app
// importa desde una sola ruta ("./utils/index.js") en vez de conocer la
// ubicación exacta de cada función.

export { formatDate, capitalize, APP_VERSION } from "./formatDate.js";
