import { KEYS, getLocal, getSession, getCookie } from "../utils/storage.js";

// Vista de diagnóstico: muestra en vivo lo que hay guardado en cada uno
// de los 3 mecanismos de persistencia del cliente
export default function DiagnosticView() {
  const theme = getLocal(KEYS.THEME);
  const search = getSession(KEYS.HOME_SEARCH);
  const visits = getCookie(KEYS.VISITS_COOKIE);

  return `
    <section class="view-diagnostic">
      <div class="card diagnostic-panel">
        <h2>Diagnóstico de almacenamiento</h2>
        <p class="subtitle">Valores actuales guardados en el cliente (Ejercicio 3 — Persistencia).</p>

        <div class="diagnostic-row">
          <div>
            <strong>localStorage</strong> — tema
            <p id="diag-theme-value">${theme ?? "(sin definir — usa claro por defecto)"}</p>
          </div>
          <button id="clear-theme-btn" type="button" class="btn-clear">Limpiar</button>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>sessionStorage</strong> — última búsqueda en Inicio
            <p id="diag-search-value">${search || "(vacío)"}</p>
          </div>
          <button id="clear-search-btn" type="button" class="btn-clear">Limpiar</button>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Cookie</strong> — visitas registradas (expira en 30 días)
            <p id="diag-visits-value">${visits ?? "0"}</p>
          </div>
          <button id="clear-visits-btn" type="button" class="btn-clear">Limpiar</button>
        </div>
      </div>
    </section>
  `;
}