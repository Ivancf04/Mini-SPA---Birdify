import Router from "./router/router.js";
import HomeView from "./views/HomeView.js";
import AboutView from "./views/AboutView.js";
import ItemDetailView from "./views/ItemDetailView.js";
import DiagnosticView from "./views/DiagnosticView.js";
import { KEYS, getLocal, setLocal, removeLocal, getCookie, setCookie, deleteCookie, setSession, removeSession } from "./utils/storage.js";

const routes = [
  { path: "/index.html", view: HomeView }, // Para funcionamiento directo en Live Server
  { path: "/Mini-SPA---Birdify/", view: HomeView },
  { path: "/", view: HomeView },
  { path: "/acerca", view: AboutView },
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

//Botones "Limpiar" de la vista de diagnóstico (Acerca)
document.addEventListener("click", (event) => {
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
});

initTheme();
trackVisit();
router.init();
