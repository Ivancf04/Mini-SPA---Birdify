import { KEYS, getLocal, getSession, getCookie } from "../utils/storage.js";
import {
  BASE_PATH,
  SW_SCOPE,
  getSWDiagnosticData,
  checkRouteInScope,
  getCachedUrls,
} from "../pwa/registerSW.js";
import { getInstallDiagnosticState } from "../pwa/installPrompt.js";
import { getAllOutbox, getOutboxCount } from "../services/dbService.js";
import {
  isNativeBackgroundSyncSupported,
  isBackgroundSyncActive,
  isPlanBForced,
  getSyncModeLabel,
  getApiEndpoint,
  SYNC_TAG,
} from "../services/syncService.js";

/**
 * Vista de diagnóstico:
 * 1. Estado y contexto del Service Worker.
 * 2. Verificador de Scope (al menos 5 rutas).
 * 3. Experimento de Scope inválido a propósito.
 * 4. Gestión de Cache Storage (Cache API).
 * 5. Instalabilidad y Plataforma PWA.
 * 6. Sincronización Offline-First y Background Sync (Cola outbox y Plan B).
 * 7. Mecanismos de persistencia (localStorage, sessionStorage, Cookie).
 */
export default async function DiagnosticView() {
  // Datos de almacenamiento
  const theme = getLocal(KEYS.THEME);
  const search = getSession(KEYS.HOME_SEARCH);
  const visits = getCookie(KEYS.VISITS_COOKIE);

  // Datos en vivo de instalabilidad PWA
  const installState = getInstallDiagnosticState();

  // Datos en vivo del Service Worker
  const swData = await getSWDiagnosticData();

  // Entradas actuales en Cache Storage
  const cachedEntries = await getCachedUrls();

  // Datos de sincronización offline-first
  let outboxItems = [];
  try {
    outboxItems = await getAllOutbox();
  } catch (err) {
    console.error("Error al obtener cola outbox en diagnóstico:", err);
  }

  const nativeSyncSupported = isNativeBackgroundSyncSupported();
  const planBForced = isPlanBForced();
  const bgSyncActive = isBackgroundSyncActive();
  const currentModeLabel = getSyncModeLabel();
  const apiEndpoint = getApiEndpoint();

  // Definicion de las 5 rutas minimas requeridas para la verificacion de scope
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

      <!-- 6. Sincronización Offline-First y Background Sync (Requisitos 4 y 5) -->
      <div class="card diagnostic-panel">
        <div class="diagnostic-panel-header">
          <h2>Sincronización Offline-First & Background Sync</h2>
          <span class="badge-status ${bgSyncActive ? "badge-state-activated" : "badge-state-installing"}">
            ${bgSyncActive ? "BACKGROUND SYNC ACTIVO" : "PLAN B ACTIVO"}
          </span>
        </div>
        <p class="subtitle">Inspección de la cola Outbox en IndexedDB, tag de Background Sync y modo de sincronización.</p>

        <div class="diagnostic-row">
          <div>
            <strong>Soporte nativo de Background Sync ('SyncManager' in window):</strong>
            <p class="diagnostic-value ${nativeSyncSupported ? "badge-success" : "badge-warning"}">
              ${nativeSyncSupported ? "Sí — Soportado por este navegador (Chromium/Edge)" : "No — No soportado (Safari / Firefox). Se usará Plan B."}
            </p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Tag propia registrada:</strong>
            <p><code>${SYNC_TAG}</code></p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Modo actual de sincronización:</strong>
            <p class="diagnostic-value ${bgSyncActive ? "badge-success" : "badge-warning"}">
              ${currentModeLabel}
            </p>
          </div>
        </div>

        <!-- Simulación reversible de Plan B (Requisito 5) -->
        <div class="diagnostic-row">
          <div>
            <strong>Simulación reversible: Forzar modo sin Background Sync</strong>
            <p class="subtitle" style="margin: 0.25rem 0;">
              Desactiva centralizadamente todas las rutas que registrarían Background Sync sin modificar APIs globales.
              Estado actual: <strong>${planBForced ? "FORZADO (Plan B activo)" : "NORMAL (Automático)"}</strong>.
            </p>
          </div>
          <div>
            ${
              planBForced
                ? `<button id="btn-toggle-planb-force" type="button" class="btn-action">Restaurar Automático</button>`
                : `<button id="btn-toggle-planb-force" type="button" class="btn-warning">Simular Falta de Soporte (Plan B)</button>`
            }
          </div>
        </div>

        <!-- Endpoint del backend y prueba de conectividad -->
        <div class="diagnostic-row">
          <div style="flex: 1;">
            <strong>Endpoint del servidor de avistamientos:</strong>
            <p class="subtitle" style="margin: 0.25rem 0;">Configura la URL real del backend receptor.</p>
            <input type="text" id="diag-backend-endpoint-input" value="${apiEndpoint}" style="width: 100%; max-width: 400px; padding: 0.4rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem;" />
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
            <button id="btn-save-endpoint" type="button" class="btn-action">Guardar URL</button>
            <button id="btn-ping-backend" type="button" class="btn-clear">Probar Ping</button>
          </div>
        </div>
        <div id="backend-ping-feedback" class="feedback-box" style="display: none; margin-top: 0.5rem;"></div>

        <!-- Inspección de la Cola Outbox -->
        <div style="margin-top: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong>Cola de Operaciones Pendientes (Store 'outbox'): ${outboxItems.length} elementos</strong>
            <div style="display: flex; gap: 0.5rem;">
              <button id="btn-diag-process-planb" type="button" class="btn-action" title="Procesar cola manualmente ahora">
                🔄 Procesar Cola (Plan B)
              </button>
              <button id="btn-diag-clear-server" type="button" class="btn-warning" title="Limpiar avistamientos en el servidor para reiniciar pruebas">
                🗑️ Limpiar Servidor
              </button>
            </div>
          </div>

          <div class="table-container">
            <table class="scope-table">
              <thead>
                <tr>
                  <th>ClientRequestId (Op)</th>
                  <th>Ave / Hábitat</th>
                  <th>Fecha de creación</th>
                  <th>Estado</th>
                  <th>Intentos</th>
                  <th>Último error</th>
                </tr>
              </thead>
              <tbody id="outbox-table-body">
                ${
                  outboxItems.length === 0
                    ? `<tr><td colspan="6" style="text-align: center; color: #6b7280;">No hay operaciones pendientes en la cola outbox.</td></tr>`
                    : outboxItems
                        .map(
                          (item) => `
                      <tr>
                        <td><code>${item.clientRequestId.slice(0, 12)}…</code></td>
                        <td><strong>${item.payload?.birdName || "N/A"}</strong> (${item.payload?.category || ""})</td>
                        <td><small>${new Date(item.createdAt).toLocaleTimeString()}</small></td>
                        <td><span class="badge ${item.status === "failed" ? "badge-scope-out" : "badge-scope-in"}">${item.status}</span></td>
                        <td style="text-align: center;">${item.attempts || 0}</td>
                        <td><small style="color: #ef4444;">${item.lastError || "Ninguno"}</small></td>
                      </tr>
                    `
                        )
                        .join("")
                }
              </tbody>
            </table>
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

      <!-- 4. Herramienta de depuracion: Gestion de Cache Storage (Cache API) -->
      <div class="card diagnostic-panel">
        <div class="diagnostic-panel-header">
          <h2>Gestion de Cache Storage (Cache API)</h2>
          <button id="refresh-cache-btn" type="button" class="btn-action">
            Actualizar lista
          </button>
        </div>
        <p class="subtitle">
          Recursos guardados en la cache activa. Usa <code>cache.delete()</code> para eliminar una entrada y probar datos desactualizados.
        </p>

        <div class="table-container">
          <table class="scope-table">
            <thead>
              <tr>
                <th>Recurso en Cache</th>
                <th style="width: 120px; text-align: center;">Accion</th>
              </tr>
            </thead>
            <tbody id="cache-table-body">
              ${
                cachedEntries.length === 0
                  ? `<tr><td colspan="2" style="text-align: center; color: #6b7280;">No hay entradas en cache todavia.</td></tr>`
                  : cachedEntries
                      .map(
                        (entry) => `
                    <tr>
                      <td><code>${entry.path}</code></td>
                      <td style="text-align: center;">
                        <button 
                          type="button" 
                          class="btn-clear delete-cache-entry-btn" 
                          data-cache-url="${entry.url}"
                          title="Eliminar esta entrada de Cache Storage"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  `
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Instalabilidad y Plataforma PWA (Requisitos 4 y 5) -->
      <div class="card diagnostic-panel">
        <div class="diagnostic-panel-header">
          <h2>Instalabilidad y Plataforma PWA</h2>
          <span class="badge-status ${installState.isStandalone ? "badge-state-activated" : "badge-state-installing"}">
            ${installState.isStandalone ? "STANDALONE (INSTALADA)" : "MODO NAVEGADOR"}
          </span>
        </div>
        <p class="subtitle">Detección de modo de ejecución (display-mode y standalone), captura de evento y Plan B.</p>

        <div class="diagnostic-row">
          <div>
            <strong>¿La app corre instalada (standalone)?</strong>
            <p class="diagnostic-value ${installState.isStandalone ? "badge-success" : "badge-warning"}">
              ${installState.isStandalone ? "Sí — Ejecutándose en ventana propia sin barra de direcciones" : "No — Ejecutándose dentro de la pestaña del navegador"}
            </p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Método de comprobación del modo instalado:</strong>
            <p>
              <code>matchMedia('(display-mode: standalone)'): ${window.matchMedia("(display-mode: standalone)").matches ? "true" : "false"}</code><br/>
              <code>navigator.standalone (iOS Safari): ${window.navigator.standalone === true ? "true" : "false"}</code>
            </p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Evento beforeinstallprompt disponible:</strong>
            <p class="diagnostic-value ${installState.canPrompt ? "badge-success" : "badge-warning"}">
              ${installState.canPrompt ? "Sí — Evento diferido capturado y listo para invocar" : "No — No emitido por el navegador o ya consumido"}
            </p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Dispositivo iOS / iPadOS detectado:</strong>
            <p>${installState.isIOS ? "Sí (Plan B activo: Instrucciones de Safari Compartir → Pantalla de inicio)" : "No (Chromium o navegador de escritorio estándar)"}</p>
          </div>
        </div>

        <div class="diagnostic-row">
          <div>
            <strong>Acción de prueba de instalación:</strong>
            <p class="subtitle" style="margin: 0.25rem 0 0.5rem 0;">Prueba el prompt nativo o abre la guía del Plan B según la disponibilidad.</p>
          </div>
          <div>
            ${
              installState.canPrompt
                ? `<button id="diag-install-prompt-btn" type="button" class="btn-action">Llamar promptInstall()</button>`
                : `<button id="diag-install-guide-btn" type="button" class="btn-clear">Ver Guía Plan B</button>`
            }
          </div>
        </div>
      </div>

      <!-- 7. Diagnóstico de Almacenamiento (Persistencia previa) -->
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