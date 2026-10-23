import Router from "./router/router.js";
import HomeView from "./views/HomeView.js";
import AboutView from "./views/AboutView.js";
import SightingsView from "./views/SightingsView.js";
import ItemDetailView from "./views/ItemDetailView.js";
import DiagnosticView from "./views/DiagnosticView.js";
import { 
  KEYS, 
  getLocal, 
  setLocal, 
  removeLocal, 
  getCookie, 
  setCookie, 
  deleteCookie, 
  setSession, 
  removeSession } from "./utils/storage.js";
import {
  saveSighting,
  saveSightingWithOutbox,
  getAllSightings,
  getSightingsByCategory,
  deleteSighting,
  getOutboxCount,
  getAllOutbox,
} from "./services/dbService.js";
import {
  initSyncCoordinator,
  scheduleOrTriggerSync,
  processOutboxQueuePlanB,
  isBackgroundSyncActive,
  getSyncModeLabel,
  isPlanBForced,
  setForcePlanB,
  getApiEndpoint,
  setApiEndpoint,
  SYNC_TAG,
} from "./services/syncService.js";
import { renderSightingsList } from "./views/SightingsView.js";
import {
  registerServiceWorker,
  getSWDiagnosticData,
  registerInvalidScope,
  getCachedUrls,
  deleteCachedUrl,
} from "./pwa/registerSW.js";
import { initNetworkStatus } from "./pwa/networkStatus.js";
import {
  initInstallPrompt,
  promptInstall,
  isInstallPromptAvailable,
  isRunningStandalone,
  isIOSDevice,
  getInstallDiagnosticState,
  onInstallStateChange,
} from "./pwa/installPrompt.js";

// Requisito 3: El módulo debe iniciarse al arrancar la app, no al abrir una vista
initInstallPrompt();
// Inicializar coordinador centralizado de Background Sync y Plan B (Requisitos 4 y 5)
initSyncCoordinator();

// Funciones utilitarias expuestas globalmente en la consola de DevTools
window.birdifySync = {
  scheduleOrTrigger: scheduleOrTriggerSync,
  processPlanB: processOutboxQueuePlanB,
  setForcePlanB,
  isPlanBForced,
  getOutboxCount,
  getAllOutbox,
  getEndpoint: getApiEndpoint,
  setEndpoint: setApiEndpoint,
};
window.deleteCacheEntry = async function (url) {
  const ok = await deleteCachedUrl(url);
  console.log(`[Cache Delete] Eliminación de '${url}': ${ok ? "EXITOSA" : "FALLIDA / NO ENCONTRADA"}`);
  return ok;
};

window.listCacheEntries = async function () {
  const entries = await getCachedUrls();
  console.log("=== ENTRADAS EN CACHE STORAGE ===");
  if (entries.length === 0) {
    console.warn("No hay entradas en caché todavía o el SW aún se está instalando.");
  } else {
    console.table(entries);
  }
  return entries;
};

window.checkSW = async function () {
  const data = await getSWDiagnosticData();
  console.log("=== DIAGNÓSTICO DEL SERVICE WORKER ===");
  console.table(data);
  return data;
};

// Requisito 3: Función global que llama a prompt() y devuelve lo que el usuario eligió
window.promptInstall = promptInstall;
window.pwaInstall = {
  prompt: promptInstall,
  isAvailable: isInstallPromptAvailable,
  isStandalone: isRunningStandalone,
  isIOS: isIOSDevice,
  getState: getInstallDiagnosticState,
};
// Función utilitaria para mostrar alertas visuales al usuario
function showDbFeedback(message, isError = false, durationMs = 5000) {
  const banner = document.getElementById("db-feedback");
  if (!banner) return;
  banner.textContent = message;
  banner.className = `feedback-banner ${isError ? "feedback-banner--error" : "feedback-banner--success"}`;
  banner.style.display = "block";
  if (banner._hideTimeout) clearTimeout(banner._hideTimeout);
  banner._hideTimeout = setTimeout(() => {
    banner.style.display = "none";
  }, durationMs);
}

// Función auxiliar para actualizar la barra de estado de sincronización y pendientes
async function updateSyncToolbar() {
  const countBadge = document.getElementById("pending-count-badge");
  const modeBadge = document.getElementById("sync-mode-badge");

  if (countBadge) {
    try {
      const count = await getOutboxCount();
      countBadge.textContent = `${count} pendientes`;
      if (count > 0) {
        countBadge.classList.add("badge-pending-count--has");
      } else {
        countBadge.classList.remove("badge-pending-count--has");
      }
    } catch (err) {
      console.warn("[main.js] Error al consultar outbox count:", err);
    }
  }

  if (modeBadge) {
    const isBg = isBackgroundSyncActive();
    modeBadge.textContent = isBg
      ? "⚡ Modo Background Sync"
      : "🔄 Modo compatible: reintentos al abrir, recuperar conexión o pulsar el botón";
    modeBadge.className = `sync-mode-badge ${
      isBg ? "sync-mode-badge--bgsync" : "sync-mode-badge--compatible"
    }`;
  }
}

// 1. Flujo Offline-First del Formulario: Guardar primero en IndexedDB + Outbox, luego sincronizar
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "sighting-form") return;
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  // a) Validar los datos
  const birdName = (formData.get("birdName") || "").trim();
  const location = (formData.get("location") || "").trim();
  const category = (formData.get("category") || "").trim();
  const date = (formData.get("date") || "").trim();
  const notes = (formData.get("notes") || "").trim();

  if (!birdName || !location || !category || !date) {
    showDbFeedback("Por favor completa los campos obligatorios (*).", true);
    return;
  }

  const sightingData = {
    birdName,
    location,
    category,
    date,
    notes,
  };

  try {
    // b & c) Guardar localmente y encolar en outbox en una sola transacción atómica, esperando su conclusión
    const result = await saveSightingWithOutbox(sightingData);

    // d) Actualizar la interfaz de inmediato (refleja 'pendiente' en IndexedDB)
    form.reset();
    const dateInput = document.getElementById("bird-date");
    if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];

    const filterSelect = document.getElementById("filter-category");
    const currentFilter = filterSelect ? filterSelect.value : "ALL";
    await refreshSightingsList(currentFilter);
    await updateSyncToolbar();

    // Mensaje diferenciado: Guardado localmente en el dispositivo
    showDbFeedback(
      `📱 Guardado en el dispositivo (IndexedDB). Operación en cola [${result.clientRequestId.slice(0, 8)}…].`,
      false
    );

    // e) Solo después intentar enviar o programar la sincronización
    console.log("[main.js] Guardado local concluido. Programando sincronización...");
    const syncResult = await scheduleOrTriggerSync();

    if (syncResult && syncResult.mode === "background-sync") {
      console.log("[main.js] Background Sync registrado con el navegador.");
    } else if (syncResult && syncResult.synced > 0) {
      showDbFeedback(
        `☁️ ¡Envío confirmado por el servidor para "${birdName}"!`,
        false
      );
      await refreshSightingsList(currentFilter);
      await updateSyncToolbar();
    } else if (syncResult && syncResult.failed > 0) {
      await refreshSightingsList(currentFilter);
      await updateSyncToolbar();
    }
  } catch (error) {
    console.error("Fallo al guardar en IndexedDB:", error);
    showDbFeedback(
      `Error al guardar en el dispositivo: ${error.message || "Fallo en la base de datos local."}`,
      true
    );
  }
});
// 2. Filtrar registros usando el Índice de IndexedDB
document.addEventListener("change", async (event) => {
  if (event.target.id !== "filter-category") return;
  const category = event.target.value;
  await refreshSightingsList(category);
});
// Variable para almacenar el ID del avistamiento a eliminar
let sightingToDeleteId = null;

function openDeleteModal(id) {
  sightingToDeleteId = id;
  const modal = document.getElementById("delete-modal");
  if (modal) modal.style.display = "flex";
}

function closeDeleteModal() {
  sightingToDeleteId = null;
  const modal = document.getElementById("delete-modal");
  if (modal) modal.style.display = "none";
}

// 3. Manejo de eliminación con modal de confirmación
document.addEventListener("click", async (event) => {
  // Clic en botón "Eliminar" de una tarjeta -> Abre el modal
  const deleteBtn = event.target.closest("[data-delete-id]");
  if (deleteBtn) {
    const id = Number(deleteBtn.dataset.deleteId);
    openDeleteModal(id);
    return;
  }

  // Clic en "Cancelar" o en el fondo del modal -> Cierra el modal
  if (event.target.id === "modal-cancel-btn" || event.target.id === "delete-modal") {
    closeDeleteModal();
    return;
  }

  // Clic en "Sí, eliminar" dentro del modal -> Ejecuta el borrado en IndexedDB
  if (event.target.id === "modal-confirm-btn") {
    if (!sightingToDeleteId) return;
    const id = sightingToDeleteId;
    closeDeleteModal();

    try {
      await deleteSighting(id);
      showDbFeedback("Registro eliminado correctamente de IndexedDB.", false);
      const filterSelect = document.getElementById("filter-category");
      const currentFilter = filterSelect ? filterSelect.value : "ALL";
      await refreshSightingsList(currentFilter);
    } catch (error) {
      console.error("Error al eliminar de IndexedDB:", error);
      showDbFeedback("No se pudo eliminar el registro.", true);
    }
    await updateSyncToolbar();
  }

  // Botón "Reintentar ahora" en SightingsView (Requisitos 3, 4 y 5)
  if (event.target.id === "btn-retry-sync") {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = "⏳ Sincronizando...";

    try {
      // Intenta registrar Background Sync o ejecuta el Plan B
      const syncResult = await scheduleOrTriggerSync();

      if (syncResult && syncResult.mode === "background-sync") {
        showDbFeedback("⚡ Background Sync registrado con el navegador. Procesando cola...", false);
      } else {
        const results = await processOutboxQueuePlanB("btn-retry-sync-click");
        if (results && results.synced > 0) {
          showDbFeedback(`☁️ Envío confirmado por el servidor: ${results.synced} avistamiento(s) sincronizado(s).`, false);
        } else if (results && results.failed > 0) {
          showDbFeedback(`⚠️ Se detectaron ${results.failed} fallo(s) al enviar. Revisa el estado de la bitácora.`, true);
        } else if (results && results.total === 0) {
          showDbFeedback("No hay operaciones pendientes en la cola outbox.", false);
        }
      }
    } catch (err) {
      console.error("[main.js] Error al reintentar sincronización:", err);
      showDbFeedback(`Error en reintento: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "🔄 Reintentar ahora";
      const filterSelect = document.getElementById("filter-category");
      await refreshSightingsList(filterSelect ? filterSelect.value : "ALL");
      await updateSyncToolbar();
    }
  }

  // Botón "Simular Falta de Soporte / Restaurar Automático" en DiagnosticView (Requisito 5)
  if (event.target.id === "btn-toggle-planb-force") {
    const nextForced = !isPlanBForced();
    setForcePlanB(nextForced);
    alert(
      nextForced
        ? "Modo Plan B forzado activo. Se simula falta de Background Sync sin alterar APIs globales del navegador."
        : "Modo automático restaurado. Background Sync se utilizará si el navegador lo soporta."
    );
    router.render(); // Refrescar vista de diagnóstico
  }

  // Botón "Guardar URL" del backend en DiagnosticView
  if (event.target.id === "btn-save-endpoint") {
    const input = document.getElementById("diag-backend-endpoint-input");
    if (input) {
      const newUrl = input.value.trim();
      setApiEndpoint(newUrl);
      // Notificar al SW activo si existe
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "BIRDIFY_SET_BACKEND_ENDPOINT",
          endpoint: newUrl,
        });
      }
      alert(`Endpoint actualizado a: ${newUrl}`);
      router.render();
    }
  }

  // Botón "Probar Ping" al backend en DiagnosticView
  if (event.target.id === "btn-ping-backend") {
    const feedbackEl = document.getElementById("backend-ping-feedback");
    if (!feedbackEl) return;
    feedbackEl.style.display = "block";
    feedbackEl.className = "feedback-box";
    feedbackEl.innerHTML = "Verificando conexión con el servidor backend...";

    try {
      const endpoint = getApiEndpoint();
      const baseApiUrl = endpoint.replace(/\/sightings\/?$/, "");
      const healthUrl = `${baseApiUrl}/health`;

      const res = await fetch(healthUrl, { method: "GET" });
      const data = await res.json();

      feedbackEl.className = "feedback-box feedback-box--success";
      feedbackEl.innerHTML = `
        <strong>Servidor conectado exitosamente (HTTP ${res.status}):</strong>
        <p>${data.service || "Servicio activo"} — ${data.status || "OK"}</p>
        <small>Timestamp: ${data.timestamp || new Date().toISOString()}</small>
      `;
    } catch (err) {
      feedbackEl.className = "feedback-box feedback-box--error";
      feedbackEl.innerHTML = `
        <strong>Error de conexión con el backend:</strong>
        <p>${err.message}</p>
        <small>Asegúrate de haber iniciado el servidor con <code>node server.js</code> en el puerto configurado.</small>
      `;
    }
  }

  // Botón "Procesar Cola (Plan B)" en DiagnosticView
  if (event.target.id === "btn-diag-process-planb") {
    const results = await processOutboxQueuePlanB("diagnostic-view");
    alert(`Procesamiento finalizado:\nTotal: ${results.total}\nSincronizados: ${results.synced}\nFallidos: ${results.failed}`);
    router.render();
  }

  // Botón "Limpiar Servidor" en DiagnosticView
  if (event.target.id === "btn-diag-clear-server") {
    const confirmed = confirm("¿Deseas vaciar todos los registros del servidor remoto para pruebas limpias?");
    if (confirmed) {
      try {
        await fetch(getApiEndpoint(), { method: "DELETE" });
        alert("Base de datos del servidor vaciada con éxito.");
        router.render();
      } catch (err) {
        alert(`Error al limpiar servidor: ${err.message}`);
      }
    }
  }

  // Boton "Actualizar lista de cache"
  if (event.target.id === "refresh-cache-btn") {
    const tbody = document.getElementById("cache-table-body");
    if (!tbody) return;
    const entries = await getCachedUrls();
    if (entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: #6b7280;">No hay entradas en cache.</td></tr>`;
    } else {
      tbody.innerHTML = entries
        .map(
          (entry) => `
            <tr>
              <td><code>${entry.path}</code></td>
              <td style="text-align: center;">
                <button type="button" class="btn-clear delete-cache-entry-btn" data-cache-url="${entry.url}">
                  Eliminar
                </button>
              </td>
            </tr>
          `
        )
        .join("");
    }
  }
  // Boton "Eliminar" individual de una entrada de cache
  const deleteCacheBtn = event.target.closest(".delete-cache-entry-btn");
  if (deleteCacheBtn) {
    const url = deleteCacheBtn.dataset.cacheUrl;
    const confirmed = confirm(`¿Deseas eliminar '${url}' de la caché?`);
    if (confirmed) {
      await deleteCachedUrl(url);
      deleteCacheBtn.closest("tr")?.remove();
    }
  }
});
// Función auxiliar para recargar la lista según el filtro
async function refreshSightingsList(category = "ALL") {
  const listContainer = document.getElementById("sightings-list");
  if (!listContainer) return;
  try {
    let items;
    if (category === "ALL") {
      items = await getAllSightings(); // db.getAll
    } else {
      items = await getSightingsByCategory(category); // db.getAllFromIndex
    }
    listContainer.innerHTML = renderSightingsList(items);
  } catch (error) {
    listContainer.innerHTML = `<p class="error-text">Error al leer los datos: ${error.message}</p>`;
  }
}

const routes = [
  { path: "/index.html", view: HomeView }, // Para funcionamiento directo en Live Server
  { path: "/", view: HomeView },
  { path: "/acerca", view: AboutView },
  { path: "/avistamientos", view: SightingsView },
  { path: "/diagnostico", view: DiagnosticView },
  { path: "/item/:id", view: ItemDetailView },
];

const app = document.getElementById("app");
const router = new Router(routes, app);

//Tema claro/oscuro (localStorage)
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const saved = getLocal(KEYS.THEME, "light");
  applyTheme(saved);

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    setLocal(KEYS.THEME, next);
  });

  // Si el tema cambia en OTRA pestaña (misma app abierta dos veces),
  // esta pestaña se entera y se actualiza sola, sin recargar.
  window.addEventListener("storage", (event) => {
    if (event.key === KEYS.THEME && event.newValue) {
      applyTheme(event.newValue);
    }
  });
}

//Contador de visitas (Cookie, expira en 30 días)
function trackVisit() {
  const current = Number(getCookie(KEYS.VISITS_COOKIE)) || 0;
  setCookie(KEYS.VISITS_COOKIE, current + 1, 30);
}

//Filtro de búsqueda en Inicio (sessionStorage)
// y se vuelva a crear en cada navegación.
document.addEventListener("input", (event) => {
  if (event.target.id !== "home-search") return;

  const term = event.target.value;
  setSession(KEYS.HOME_SEARCH, term);

  const termLower = term.toLowerCase();
  document.querySelectorAll(".grid .card").forEach((card) => {
    const title = card.dataset.title || "";
    card.style.display = title.includes(termLower) ? "" : "none";
  });
});

//Botones "Limpiar" y acciones de diagnóstico
document.addEventListener("click", async (event) => {
  if (event.target.id === "clear-theme-btn") {
    removeLocal(KEYS.THEME);
    document.documentElement.removeAttribute("data-theme");
    const toggleBtn = document.getElementById("theme-toggle");
    if (toggleBtn) toggleBtn.textContent = "🌙";
    const out = document.getElementById("diag-theme-value");
    if (out) out.textContent = "(sin definir — usa claro por defecto)";
  }

  if (event.target.id === "clear-search-btn") {
    removeSession(KEYS.HOME_SEARCH);
    const out = document.getElementById("diag-search-value");
    if (out) out.textContent = "(vacío)";
  }

  if (event.target.id === "clear-visits-btn") {
    deleteCookie(KEYS.VISITS_COOKIE);
    const out = document.getElementById("diag-visits-value");
    if (out) out.textContent = "0";
  }

  // Boton "Actualizar estado" del Service Worker en DiagnosticView
  if (event.target.id === "refresh-sw-btn") {
    const swData = await getSWDiagnosticData();
    const supEl = document.getElementById("diag-sw-supported");
    const secEl = document.getElementById("diag-sw-secure");
    const regEl = document.getElementById("diag-sw-registered");
    const ctrlEl = document.getElementById("diag-sw-controls");
    const scopeEl = document.getElementById("diag-sw-scope");
    const scriptEl = document.getElementById("diag-sw-script");
    const stateEl = document.getElementById("diag-sw-state");

    if (supEl) {
      supEl.textContent = swData.supported ? "Si" : "No";
      supEl.className = `diagnostic-value ${swData.supported ? "badge-success" : "badge-error"}`;
    }
    if (secEl) {
      secEl.textContent = swData.isSecure ? "Si (isSecureContext)" : "No";
      secEl.className = `diagnostic-value ${swData.isSecure ? "badge-success" : "badge-error"}`;
    }
    if (regEl) {
      regEl.textContent = swData.registered ? "Si" : "No";
      regEl.className = `diagnostic-value ${swData.registered ? "badge-success" : "badge-warning"}`;
    }
    if (ctrlEl) {
      ctrlEl.textContent = swData.controlsPage
        ? "Si (navigator.serviceWorker.controller activo)"
        : "No (normal en primera carga, recarga con F5)";
      ctrlEl.className = `diagnostic-value ${swData.controlsPage ? "badge-success" : "badge-warning"}`;
    }
    if (scopeEl) scopeEl.textContent = swData.scope;
    if (scriptEl) scriptEl.textContent = swData.scriptURL;
    if (stateEl) {
      stateEl.textContent = swData.state.toUpperCase();
      stateEl.className = `badge-status badge-state-${swData.state}`;
    }
  }

  // Boton "Intentar registrar con scope invalido" en DiagnosticView
  if (event.target.id === "test-invalid-scope-btn") {
    const feedbackEl = document.getElementById("invalid-scope-feedback");
    if (!feedbackEl) return;
    feedbackEl.style.display = "block";
    feedbackEl.className = "feedback-box feedback-box--error";
    feedbackEl.innerHTML = "Intentando registrar con scope no permitido...";

    try {
      await registerInvalidScope();
      feedbackEl.className = "feedback-box";
      feedbackEl.innerHTML = "El navegador permitio el registro (inesperado si el scope es superior).";
    } catch (error) {
      console.warn("[Experimento Scope Invalido] Error capturado:", error);
      feedbackEl.className = "feedback-box feedback-box--error";
      feedbackEl.innerHTML = `
        <strong>Error de seguridad capturado (${error.name || "Error"}):</strong>
        <p>El navegador rechazo el registro porque el scope solicitado esta fuera del alcance maximo permitido para este script.</p>
        <pre>${error.name}: ${error.message}</pre>
      `;
    }
  }

  // Botón "Llamar promptInstall()" en DiagnosticView (Requisito 3 y 4)
  if (event.target.id === "diag-install-prompt-btn") {
    try {
      const res = await promptInstall();
      alert(`Resultado de la instalación: ${res.outcome}`);
      router.render(); // Refrescar vista de diagnóstico
    } catch (err) {
      alert(`Error al solicitar instalación: ${err.message}`);
    }
  }

  // Botón "Ver Guía Plan B" en DiagnosticView (Requisito 5)
  if (event.target.id === "diag-install-guide-btn") {
    openInstallGuideModal();
  }
});

// Requisito 5: Plan B - Instrucciones específicas para iOS u otros navegadores
function openInstallGuideModal() {
  const modal = document.getElementById("install-modal");
  const content = document.getElementById("install-modal-content");
  if (!modal || !content) return;

  const isIOS = isIOSDevice();
  if (isIOS) {
    content.innerHTML = `
      <h4>Instalación en iPhone / iPad (Safari)</h4>
      <p>Apple no emite el evento automático en navegadores, pero puedes agregar Birdify a tu pantalla de inicio fácilmente:</p>
      <ul class="install-steps">
        <li class="install-step-item">
          <span class="install-step-number">1</span>
          <div class="install-step-text">Toca el botón <strong>Compartir</strong> (icono <span style="font-size:1.15rem">⎋</span> cuadrado con flecha hacia arriba) en la barra de Safari.</div>
        </li>
        <li class="install-step-item">
          <span class="install-step-number">2</span>
          <div class="install-step-text">Desplázate por el menú y selecciona <strong>"Agregar a pantalla de inicio"</strong> (<span style="font-size:1.15rem">➕</span>).</div>
        </li>
        <li class="install-step-item">
          <span class="install-step-number">3</span>
          <div class="install-step-text">Pulsa <strong>"Agregar"</strong> en la esquina superior derecha.</div>
        </li>
      </ul>
      <p style="margin-top: 0.75rem; font-size: 0.85rem; color: #64748b;">
        Birdify se abrirá en su propia ventana, a pantalla completa y con acceso offline garantizado.
      </p>
    `;
  } else {
    content.innerHTML = `
      <h4>Instalación en tu navegador</h4>
      <p>Tu navegador actual no disparó el evento de instalación directa con un clic. Para instalarla o anclarla:</p>
      <ul class="install-steps">
        <li class="install-step-item">
          <span class="install-step-number">1</span>
          <div class="install-step-text">Abre el menú de opciones de tu navegador (los tres puntos <strong>⋮</strong> o <strong>⋯</strong>).</div>
        </li>
        <li class="install-step-item">
          <span class="install-step-number">2</span>
          <div class="install-step-text">Busca la opción <strong>"Instalar Birdify"</strong>, <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</div>
        </li>
        <li class="install-step-item">
          <span class="install-step-number">3</span>
          <div class="install-step-text">Confirma la instalación para disfrutar de la experiencia en ventana independiente.</div>
        </li>
      </ul>
      <p style="margin-top: 0.75rem; font-size: 0.85rem; color: #64748b;">
        <em>Nota:</em> Todas las funciones de Birdify (catálogo, avistamientos en IndexedDB y modo sin conexión) funcionan al 100% en este navegador sin bloquear ninguna funcionalidad.
      </p>
    `;
  }
  modal.hidden = false;
}

function closeInstallGuideModal() {
  const modal = document.getElementById("install-modal");
  if (modal) modal.hidden = true;
}

// Requisito 4 y 5: Gestión reactiva del botón "Instalar app" en el Shell y Plan B
function initInstallUI() {
  const installBtn = document.getElementById("install-btn");
  const guideBtn = document.getElementById("install-guide-btn");
  const installedBadge = document.getElementById("installed-badge");
  const modal = document.getElementById("install-modal");

  onInstallStateChange((state) => {
    console.log("[main.js] Estado de instalación actualizado:", state);
    if (state.isStandalone) {
      // Requisito 4: NO visible cuando la app se está ejecutando instalada
      if (installBtn) installBtn.hidden = true;
      if (guideBtn) guideBtn.hidden = true;
      if (installedBadge) installedBadge.hidden = false;
    } else {
      if (installedBadge) installedBadge.hidden = true;
      if (state.canPrompt) {
        // Requisito 4: visible SOLO cuando existe el evento guardado y la app no se ejecuta instalada
        if (installBtn) installBtn.hidden = false;
        if (guideBtn) guideBtn.hidden = true;
      } else {
        if (installBtn) installBtn.hidden = true;
        // Requisito 5: Si no hay evento y es iOS o navegador sin evento, mostrar guía Plan B
        if (guideBtn) {
          guideBtn.hidden = false;
          guideBtn.innerHTML = state.isIOS ? "📲 Instalar en iOS" : "💡 Cómo instalar";
        }
      }
    }
  });

  // Requisito 4: Clic en el botón "Instalar app" del Shell
  installBtn?.addEventListener("click", async () => {
    try {
      const choice = await promptInstall();
      if (choice && choice.outcome === "accepted") {
        showDbFeedback("¡Gracias por instalar Birdify! Disfruta la aplicación.", false);
      }
    } catch (err) {
      console.error("[main.js] Error al solicitar instalación:", err);
    }
  });

  // Requisito 5: Clic en el botón de Plan B / Guía de instalación
  guideBtn?.addEventListener("click", openInstallGuideModal);

  // Cierre del modal
  document.getElementById("close-install-modal-btn")?.addEventListener("click", closeInstallGuideModal);
  document.getElementById("dismiss-install-modal-btn")?.addEventListener("click", closeInstallGuideModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeInstallGuideModal();
  });
}

initTheme();
trackVisit();
initNetworkStatus();
initInstallUI();
router.init();

// Escuchador global de cambios de sincronización offline-first (Requisitos 3, 4 y 5)
window.addEventListener("birdify-sync-change", async (event) => {
  console.log("[main.js] Evento birdify-sync-change recibido:", event.detail);
  const filterSelect = document.getElementById("filter-category");
  const currentFilter = filterSelect ? filterSelect.value : "ALL";
  await refreshSightingsList(currentFilter);
  await updateSyncToolbar();

  const msg = event.detail?.message;
  if (msg?.type === "BIRDIFY_SYNC_ITEM_SUCCESS") {
    showDbFeedback(
      `☁️ ¡Envío confirmado por el servidor para "${msg.sighting?.birdName || "avistamiento"}"!`,
      false
    );
  } else if (msg?.type === "BIRDIFY_SYNC_ITEM_ERROR") {
    showDbFeedback(
      `⚠️ Error de sincronización en servidor: ${msg.error}`,
      true
    );
  }
});

// Eventos de bloqueo de IndexedDB (Requisito 2)
window.addEventListener("birdify-db-blocked", (event) => {
  console.warn("[main.js] Base de datos bloqueada por versión previa:", event.detail);
  const alertEl = document.getElementById("db-blocked-alert");
  if (alertEl) {
    alertEl.style.display = "block";
  }
});

window.addEventListener("birdify-db-blocking", (event) => {
  console.warn("[main.js] Conexión cerrada para desbloquear actualización:", event.detail);
  const alertEl = document.getElementById("db-blocked-alert");
  if (alertEl) {
    alertEl.innerHTML = "⚠️ <strong>Aviso:</strong> La base de datos se cerró temporalmente para permitir la actualización en otra pestaña.";
    alertEl.style.display = "block";
  }
});

// Requisito: Registro del Service Worker al cargar (o inmediato si ya cargó)
async function initSW() {
  try {
    await registerServiceWorker();
  } catch (error) {
    console.error("[main.js] No se pudo registrar el Service Worker:", error);
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  initSW();
} else {
  window.addEventListener("load", initSW);
}
