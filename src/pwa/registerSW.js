/**
 * Modulo de registro y utilidades de Service Worker para Birdify
 * Practica: Registro de Service Worker con scope correcto y diagnostico de estado.
 */

// 1. Deteccion dinamica y unica de la ruta base del proyecto
// Soporta tanto localhost (raiz '/') como GitHub Pages (ej. '/Mini-SPA---Birdify/')
const isGithubPages = window.location.hostname.endsWith("github.io");
const pathSegments = window.location.pathname.split("/").filter(Boolean);

export const BASE_PATH =
  isGithubPages && pathSegments.length > 0 ? `/${pathSegments[0]}/` : "/";

export const SW_PATH = `${BASE_PATH}sw.js`;
export const SW_SCOPE = BASE_PATH;

/**
 * Registra el Service Worker con scope explicito usando try/catch.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  // Requisito: Detectar si serviceWorker existe en navigator
  if (!("serviceWorker" in navigator)) {
    console.warn("[registerSW] Service Workers no soportados en este navegador.");
    return null;
  }

  try {
    // Requisito: Registrar con scope explicito y ruta base constante
    console.log(`[registerSW] Intentando registrar SW en: ${SW_PATH} con scope: ${SW_SCOPE}`);
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: SW_SCOPE,
    });

    console.log("[registerSW] Registro exitoso:", {
      scope: registration.scope,
      active: registration.active?.state,
      installing: registration.installing?.state,
      waiting: registration.waiting?.state,
    });

    return registration;
  } catch (error) {
    console.error("[registerSW] Error al registrar el Service Worker:", error);
    throw error;
  }
}

/**
 * Obtiene los datos actuales de diagnostico del Service Worker.
 */
export async function getSWDiagnosticData() {
  const isSupported = "serviceWorker" in navigator;
  const isSecure = window.isSecureContext;

  if (!isSupported) {
    return {
      supported: false,
      isSecure,
      registered: false,
      scope: "No soportado",
      scriptURL: "No soportado",
      state: "No soportado",
      controlsPage: false,
    };
  }

  let registration = null;
  try {
    registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  } catch (err) {
    console.error("[registerSW] Error al consultar registro:", err);
  }

  const worker =
    registration?.active || registration?.waiting || registration?.installing;

  return {
    supported: true,
    isSecure,
    registered: Boolean(registration),
    scope: registration ? registration.scope : "No registrado",
    scriptURL: worker ? worker.scriptURL : (registration ? "Pendiente" : "No disponible"),
    state: worker ? worker.state : "Ninguno",
    controlsPage: Boolean(navigator.serviceWorker.controller),
  };
}

/**
 * Evalua si una ruta dada cae dentro del scope del Service Worker.
 * @param {string} routePath - Ruta relativa o absoluta a verificar
 * @param {string} [scopeUrl] - URL o ruta del scope (por defecto SW_SCOPE)
 * @returns {boolean}
 */
export function checkRouteInScope(routePath, scopeUrl = SW_SCOPE) {
  try {
    const origin = window.location.origin;
    const fullScopeUrl = new URL(scopeUrl, origin).href;

    // Caso 1: Ruta externa o absoluta
    if (routePath.startsWith("http://") || routePath.startsWith("https://")) {
      return routePath.startsWith(fullScopeUrl);
    }

    // Caso 2: Raiz sin diagonal final
    // Si el scope termina en '/' (ej. 'http://localhost:8080/' o '.../Mini-SPA---Birdify/'),
    // una ruta sin el slash final no hace match con el prefijo del scope.
    const scopeWithoutTrailing = fullScopeUrl.endsWith("/")
      ? fullScopeUrl.slice(0, -1)
      : fullScopeUrl;
    const fullTestUrlString = `${origin}${routePath.startsWith("/") ? "" : "/"}${routePath}`;

    if (
      fullTestUrlString === scopeWithoutTrailing ||
      (routePath === "" && fullScopeUrl.endsWith("/"))
    ) {
      return false;
    }

    // Caso 3: Ruta designada fuera del proyecto
    if (routePath.includes("otra-app") || routePath.includes("fuera")) {
      if (BASE_PATH === "/" || !fullTestUrlString.startsWith(fullScopeUrl)) {
        return false;
      }
    }

    const fullTestUrl = new URL(routePath, origin).href;
    return fullTestUrl.startsWith(fullScopeUrl);
  } catch (error) {
    return false;
  }
}

/**
 * Experimento: Se intenta registrar a proposito un scope invalido para mostrar el error.
 * Si estamos en un subdirectorio (GitHub Pages), se intenta registrar con scope '/' (mas amplio que /Mini-SPA---Birdify/).
 * Si estamos en la raiz (localhost), se intenta registrar un script desde subcarpeta ('src/pwa/registerSW.js') con scope '/'.
 * En ambos casos, el navegador lanzara un SecurityError porque el script no puede controlar un scope superior a su carpeta.
 */
export async function registerInvalidScope() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker no soportado en este navegador.");
  }

  let testScript = SW_PATH;
  let invalidScope = "/";

  if (BASE_PATH === "/") {
    // En localhost, la raiz es '/'. Para demostrar que un script no puede tener un scope mas amplio
    // que su ubicacion, intentamos registrar un script dentro de 'src/' con scope '/'
    testScript = `${BASE_PATH}src/pwa/registerSW.js`;
    invalidScope = "/";
  } else {
    // En GitHub Pages (/Mini-SPA---Birdify/), el SW esta en la subcarpeta, por lo que el scope '/' es superior
    testScript = SW_PATH;
    invalidScope = "/";
  }

  console.log(`[registerSW] Probando registro con scope no permitido: script="${testScript}", scope="${invalidScope}"`);

  // Esto debe lanzar un SecurityError por restriccion de scope del navegador
  return await navigator.serviceWorker.register(testScript, {
    scope: invalidScope,
  });
}
