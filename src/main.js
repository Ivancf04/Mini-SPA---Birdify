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
  getAllSightings,
  getSightingsByCategory,
  deleteSighting,
} from "./services/dbService.js";
import { renderSightingsList } from "./views/SightingsView.js";
import {
  registerServiceWorker,
  getSWDiagnosticData,
  registerInvalidScope,
} from "./pwa/registerSW.js";

// Función utilitaria para mostrar alertas visuales al usuario
function showDbFeedback(message, isError = false) {
  const banner = document.getElementById("db-feedback");
  if (!banner) return;
  banner.textContent = message;
  banner.className = `feedback-banner ${isError ? "feedback-banner--error" : "feedback-banner--success"}`;
  banner.style.display = "block";
  setTimeout(() => {
    banner.style.display = "none";
  }, 4000);
}
// 1. Guardar nuevo registro (con try / catch y feedback visual)
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "sighting-form") return;
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const sighting = {
    birdName: formData.get("birdName").trim(),
    location: formData.get("location").trim(),
    category: formData.get("category"),
    date: formData.get("date"),
    notes: formData.get("notes").trim(),
    createdAt: new Date().toISOString(),
  };
  try {
    // Operación de escritura en IndexedDB
    await saveSighting(sighting);
    showDbFeedback("¡Avistamiento guardado exitosamente en IndexedDB!", false);
    form.reset();
    document.getElementById("bird-date").value = new Date().toISOString().split("T")[0];
    // Refrescar la lista de registros
    const filterSelect = document.getElementById("filter-category");
    const currentFilter = filterSelect ? filterSelect.value : "ALL";
    await refreshSightingsList(currentFilter);
  } catch (error) {
    // Requisito 3: Manejo de errores con feedback visible
    console.error("Fallo al guardar en IndexedDB:", error);
    showDbFeedback(`Error al guardar el avistamiento: ${error.message || "Fallo en la base de datos local."}`, true);
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
});

initTheme();
trackVisit();
router.init();

// Requisito: Registro al cargar la página usando el evento load
window.addEventListener("load", async () => {
  try {
    await registerServiceWorker();
  } catch (error) {
    console.error("[main.js] No se pudo registrar el Service Worker al cargar:", error);
  }
});
