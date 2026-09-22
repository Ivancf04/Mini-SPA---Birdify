import { KEYS, getLocal, getSession, getCookie } from "../utils/storage.js";
import {
  BASE_PATH,
  SW_SCOPE,
  getSWDiagnosticData,
  checkRouteInScope,
} from "../pwa/registerSW.js";

/**
 * Vista de diagnóstico:
 * 1. Estado y contexto del Service Worker.
 * 2. Verificador de Scope (al menos 5 rutas).
 * 3. Experimento de Scope inválido a propósito.
 * 4. Mecanismos de persistencia (localStorage, sessionStorage, Cookie).
 */
export default async function DiagnosticView() {
  // Datos de almacenamiento
  const theme = getLocal(KEYS.THEME);
  const search = getSession(KEYS.HOME_SEARCH);
  const visits = getCookie(KEYS.VISITS_COOKIE);

  // Datos en vivo del Service Worker
  const swData = await getSWDiagnosticData();

  // Definicion de las 5 rutas minimas requeridas para la verificacion de scope:
  // 1. La raiz del proyecto
  // 2. Una ruta del router
  // 3. Un archivo interno
  // 4. La raiz sin diagonal final
  // 5. Una ruta fuera del proyecto
  const testRoutes = [
    {
      label: "La raiz del proyecto",
      path: BASE_PATH,
      expected: true,
    },
    {
      label: "Una ruta del router",
      path: `${BASE_PATH}avistamientos`,
      expected: true,
    },
    {
      label: "Un archivo interno",
      path: `${BASE_PATH}src/main.js`,
      expected: true,
    },
    {
      label: "La raiz sin diagonal final",
      path: BASE_PATH === "/" ? "" : BASE_PATH.slice(0, -1),
      expected: false,
    },
    {
      label: "Una ruta fuera de tu proyecto",
      path: "/otra-app/panel",
      expected: false,
    },
  ];

  return `
    <section class="view-diagnostic">
      <!-- 1. Diagnostico del Service Worker -->
      <div class="card diagnostic-panel">
        <div class="diagnostic-panel-header">
          <h2>Diagnostico de Service Worker</h2>
          <button id="refresh-sw-btn" type="button" class="btn-action">
            Actualizar estado
          </button>
        </div>
        <p class="subtitle">Inspeccion en vivo del registro, contexto y control del Service Worker.</p>

        <div class="diagnostic-row">
          <div>
            <strong>Navegador soporta Service Workers?</strong>
            <p id="diag-sw-supported">${swData.supported ? "Si" : "No"}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Contexto seguro (HTTPS o localhost)?</strong>
            <p id="diag-sw-secure">${swData.isSecure ? "Si (isSecureContext)" : "No"}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>SW registrado?</strong>
            <p id="diag-sw-registered">${swData.registered ? "Si" : "No"}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Controla esta pagina?</strong>
            <p id="diag-sw-controls">${swData.controlsPage ? "Si (navigator.serviceWorker.controller activo)" : "No (normal en primera carga, recarga con F5)"}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Scope del Service Worker:</strong>
            <p id="diag-sw-scope">${swData.scope}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>URL del script del SW:</strong>
            <p id="diag-sw-script">${swData.scriptURL}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Estado del worker:</strong>
            <p>
              <span id="diag-sw-state" class="badge-status badge-state-${swData.state}">
                ${swData.state.toUpperCase()}
              </span>
            </p>
          </div>
        </div>
      </div>

      <!-- 2. Verificador de Scope -->
      <div class="card diagnostic-panel">
        <h2>Verificador de Scope</h2>
        <p class="subtitle">
          Scope activo: <code>${SW_SCOPE}</code>. Comprobacion de que rutas quedan dentro o fuera del alcance de control del SW.
        </p>

        <div class="table-container">
          <table class="scope-table">
            <thead>
              <tr>
                <th>Tipo de ruta</th>
                <th>Ruta probada</th>
                <th>Estado del scope</th>
              </tr>
            </thead>
            <tbody id="scope-table-body">
              ${testRoutes
                .map((route) => {
                  const inScope = checkRouteInScope(route.path);
                  return `
                    <tr>
                      <td><strong>${route.label}</strong></td>
                      <td><code>${route.path || "(raiz vacia sin /)"}</code></td>
                      <td>
                        <span class="badge ${inScope ? "badge-scope-in" : "badge-scope-out"}">
                          ${inScope ? "Dentro del scope" : "Fuera del scope"}
                        </span>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. Experimento de Scope Invalido a Proposito -->
      <div class="card diagnostic-panel">
        <h2>Experimento: Scope invalido a proposito</h2>
        <p class="subtitle">
          Intenta registrar el Service Worker con un scope superior o mas amplio que su carpeta, provocando un error de seguridad (<code>SecurityError</code>).
        </p>

        <div class="experiment-actions">
          <button id="test-invalid-scope-btn" type="button" class="btn-warning">
            Intentar registrar con scope invalido
          </button>
        </div>

        <div id="invalid-scope-feedback" class="feedback-box" style="display: none;"></div>
      </div>

      <!-- 4. Diagnóstico de Almacenamiento (Persistencia previa) -->
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