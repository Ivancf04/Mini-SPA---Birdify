// sw.js — service worker de birdify
// unidad 3 · ejercicio 4: estrategias de caché por tipo de recurso (offline first)

console.log("[sw.js] service worker corriendo");
console.log("[sw.js] contexto global (self.constructor.name):", self.constructor.name);
console.log("[sw.js] typeof window:", typeof window);
console.log("[sw.js] typeof document:", typeof document);
console.log("[sw.js] typeof localStorage:", typeof localStorage);
console.log("[sw.js] scope (self.registration.scope):", self.registration.scope);

// ─────────────────────────────────────────────────────────────────────
// 1. versionado
// ─────────────────────────────────────────────────────────────────────
// v1 -> v2: agregamos estrategias por recurso, los json propios y el
// precache completo (vistas, servicios, utilidades, datos y cdn).
// todo lo de birdify va en una sola caché por version; activate borra
// cualquier otra caché "birdify-*" que sea vieja.
const CACHE_PREFIX = "birdify-shell";
const CACHE_VERSION = "v2";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;

// origenes externos que ocupa la app
const CDN_ORIGIN = "https://cdn.jsdelivr.net";
const INATURALIST_API_ORIGIN = "https://api.inaturalist.org";

// libreria idb en cdn: dbService la importa directo, asi que sin ella
// la app ni arranca. dejamos version fija (8.0.4) para que no cambie y jale cache first.
const IDB_MODULE_URL = `${CDN_ORIGIN}/npm/idb@8.0.4/+esm`;

// primera llamada que hace inicio para el catalogo (coincide con apiService.getBirds(9))
const INATURALIST_HOME_URL =
  `${INATURALIST_API_ORIGIN}/v1/taxa?taxon_id=3&rank=species&per_page=9&locale=es`;

// ─────────────────────────────────────────────────────────────────────
// 2. precaching
// ─────────────────────────────────────────────────────────────────────
// todo lo necesario para arrancar y navegar sin red. si falta uno solo,
// addAll truena y sigue activa la version anterior.
const PRECACHE_LOCAL = [
  // App Shell
  "./",
  "./index.html",
  // Estilos
  "./styles/shell.css",
  "./styles/home.css",
  "./styles/sightings.css",
  "./styles/detail.css",
  "./styles/theme.css",
  "./styles/diagnostic.css",
  // Punto de entrada, router y PWA
  "./src/main.js",
  "./src/router/router.js",
  "./src/pwa/registerSW.js",
  "./src/pwa/networkStatus.js",
  // Vistas (NotFoundView e ItemDetailView -> apiService se cargan con import())
  "./src/views/HomeView.js",
  "./src/views/AboutView.js",
  "./src/views/SightingsView.js",
  "./src/views/ItemDetailView.js",
  "./src/views/DiagnosticView.js",
  "./src/views/NotFoundView.js",
  // Componentes
  "./src/components/ItemCard.js",
  // Servicios
  "./src/services/apiService.js",
  "./src/services/dbService.js",
  "./src/services/contentService.js",
  // Utilidades
  "./src/utils/slugify.js",
  "./src/utils/storage.js",
  // Datos iniciales propios
  "./data/boletin.json",
  "./data/consejos.json",
];

const PRECACHE_EXTERNAL = [IDB_MODULE_URL];

// opcional: si la api no contesta al instalar, no tiramos el install;
// inicio simplemente se llena luego en vivo con network first.
const PRECACHE_OPTIONAL = [INATURALIST_HOME_URL];

self.addEventListener("install", (event) => {
  console.log(`[SW] instalando ${CACHE_NAME}`);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // cache: "reload" para no jalar cosas viejas de la caché http
      const required = [...PRECACHE_LOCAL, ...PRECACHE_EXTERNAL].map(
        (url) => new Request(url, { cache: "reload" })
      );
      await cache.addAll(required);
      console.log(`[SW] precache obligatorio listo (${required.length} recursos)`);

      const optional = await Promise.allSettled(
        PRECACHE_OPTIONAL.map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await cache.put(url, response);
        })
      );
      optional.forEach((result, i) => {
        if (result.status === "rejected") {
          console.warn(`[SW] no se pudo precachear opcional: ${PRECACHE_OPTIONAL[i]}`, result.reason);
        }
      });

      await self.skipWaiting();
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────
// 3. activate: borrar caches viejas
// ─────────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log(`[SW] activando ${CACHE_NAME}`);
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("birdify-") && name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] borrando caché vieja: ${name}`);
            return caches.delete(name);
          })
      );
      console.log("[SW] caches activas tras activate:", await caches.keys());
      await self.clients.claim();
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────
// 4. funciones de ayuda
// ─────────────────────────────────────────────────────────────────────
function shortUrl(url) {
  const u = new URL(url);
  return u.origin === self.location.origin ? u.pathname + u.search : u.host + u.pathname;
}

function log(strategy, label, message, url) {
  console.log(`[SW][${strategy}] ${label} → ${message}: ${shortUrl(url)}`);
}

// algunos servers locales regresan 301 con "./"; respuestas con redirected=true
// no sirven para una navegacion, asi que armamos una respuesta limpia con 200
function sanitizeResponse(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status || 200,
    statusText: response.statusText || "OK",
    headers: response.headers,
  });
}

// marca de donde salio el dato (para saber en la vista si vino de red o de caché)
function withSource(response, source) {
  const headers = new Headers(response.headers);
  headers.set("X-Birdify-Fuente", source);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// solo guardamos respuestas buenas. las opacas (fotos externas sin cors)
// no dejan ver el status, asi que solo se guardan si viene allowOpaque
function isCacheable(response, allowOpaque = false) {
  if (!response) return false;
  if (response.ok) return true;
  return allowOpaque && response.type === "opaque";
}

async function fetchWithTimeout(request, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage(message));
}

// ─────────────────────────────────────────────────────────────────────
// 5. respuesta de emergencia (sin red y sin copia en caché)
// ─────────────────────────────────────────────────────────────────────
function offlineFallback(request, label) {
  const url = new URL(request.url);
  const headers = { "X-Birdify-Offline": "1", "Cache-Control": "no-store" };
  console.warn(`[SW][Fallback] ${label} → sin red y sin copia en caché, respondo 503: ${shortUrl(request.url)}`);

  if (request.mode === "navigate") {
    return new Response(
      `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Birdify — sin conexion</title></head>
      <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1e2761">
      <h1 style="color:#018547">no se pudo cargar la pagina</h1>
      <p>no hay red y esta seccion aun no se habia guardado en caché.</p>
      <p>conectate a internet e intenta de nuevo.</p>
      <p><a href="./">volver a intentar</a></p></body></html>`,
      { status: 503, statusText: "Service Unavailable", headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (request.destination === "image") {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
        <rect width="400" height="260" fill="#e2e8f0"/>
        <text x="200" y="125" font-family="system-ui,sans-serif" font-size="40" text-anchor="middle">🪶</text>
        <text x="200" y="165" font-family="system-ui,sans-serif" font-size="16" fill="#475569" text-anchor="middle">Foto no disponible sin conexión</text>
      </svg>`,
      { status: 503, statusText: "Service Unavailable", headers: { ...headers, "Content-Type": "image/svg+xml" } }
    );
  }

  const wantsJson =
    url.pathname.endsWith(".json") ||
    url.origin === INATURALIST_API_ORIGIN ||
    (request.headers.get("Accept") || "").includes("application/json");

  if (wantsJson) {
    return new Response(
      JSON.stringify({
        offline: true,
        mensaje: "sin conexion y sin copia en caché de este recurso",
        recurso: shortUrl(request.url),
      }),
      { status: 503, statusText: "Service Unavailable", headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  return new Response("Birdify: recurso no disponible sin conexion.", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ─────────────────────────────────────────────────────────────────────
// 6. ESTRATEGIAS (una función por estrategia)
// ─────────────────────────────────────────────────────────────────────

/**
 * CACHE FIRST: responde desde caché; solo va a la red si no hay copia y,
 * si la obtiene, la guarda para la próxima vez.
 * options.cacheKey   -> clave alternativa (para el App Shell en navegaciones)
 * options.allowOpaque -> permite guardar respuestas opacas (imágenes externas)
 */
async function cacheFirst(event, request, label, options = {}) {
  const cache = await caches.open(CACHE_NAME);
  const keys = options.cacheKeys || [request];

  for (const key of keys) {
    const cached = await cache.match(key, { ignoreVary: true });
    if (cached) {
      log("Cache First", label, "CACHÉ", request.url);
      return sanitizeResponse(cached);
    }
  }

  try {
    const response = await fetch(request);
    if (isCacheable(response, options.allowOpaque) && request.mode !== "navigate") {
      event.waitUntil(cache.put(request, response.clone()));
      log("Cache First", label, "RED (guardado en caché)", request.url);
    } else {
      log("Cache First", label, `RED (no se guarda, status ${response.status})`, request.url);
    }
    return response;
  } catch (error) {
    return offlineFallback(request, label);
  }
}

/**
 * NETWORK FIRST: intenta la red (con timeout para "lie-fi"); si responde
 * bien actualiza la caché. Si la red falla, usa la última copia guardada.
 */
async function networkFirst(event, request, label, options = {}) {
  const cache = await caches.open(CACHE_NAME);
  const timeoutMs = options.timeoutMs ?? 4000;

  try {
    // no-cache: obliga a revalidar con el servidor y no usar la caché HTTP
    const response = await fetchWithTimeout(request, timeoutMs, { cache: "no-cache" });
    if (response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
      log("Network First", label, "RED (caché actualizada)", request.url);
    } else {
      log("Network First", label, `RED con status ${response.status} (no se guarda)`, request.url);
    }
    return options.tagSource ? withSource(response, "red") : response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) {
      log("Network First", label, `CACHÉ (la red falló: ${error.name})`, request.url);
      event.waitUntil(notifyClients({ type: "BIRDIFY_CACHE_FALLBACK", label, url: request.url }));
      return options.tagSource ? withSource(cached, "cache (sin red)") : cached;
    }
    return offlineFallback(request, label);
  }
}

/**
 * STALE-WHILE-REVALIDATE: responde al instante con la copia guardada y, en
 * paralelo, pide la versión nueva a la red para la PRÓXIMA petición.
 */
async function staleWhileRevalidate(event, request, label, options = {}) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });

  const revalidation = fetch(request, { cache: "no-cache" })
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        log("SWR", label, "revalidado, caché actualizada para la próxima vez", request.url);
      }
      return response;
    })
    .catch((error) => {
      log("SWR", label, `no se pudo revalidar (${error.name})`, request.url);
      return null;
    });

  if (cached) {
    event.waitUntil(revalidation);
    log("SWR", label, "CACHÉ (puede estar desactualizada, revalidando)", request.url);
    return options.tagSource ? withSource(cached, "cache (revalidando en segundo plano)") : cached;
  }

  const fresh = await revalidation;
  if (fresh) {
    log("SWR", label, "RED (no había copia)", request.url);
    return options.tagSource ? withSource(fresh, "red (primera vez)") : fresh;
  }
  return offlineFallback(request, label);
}

// ─────────────────────────────────────────────────────────────────────
// 7. TABLA DE DECISIÓN LLEVADA A CÓDIGO
// ─────────────────────────────────────────────────────────────────────
// Se evalúa en orden; gana la primera regla que coincide.
const SAME_ORIGIN = self.location.origin;
const SCOPE_PATH = new URL(self.registration.scope).pathname; // "/" o "/Mini-SPA---Birdify/"

const ROUTES = [
  {
    label: "Navegación (App Shell)",
    test: ({ request }) => request.mode === "navigate",
    handler: (event, request, label) =>
      cacheFirst(event, request, label, { cacheKeys: ["./", "./index.html"] }),
  },
  {
    label: "Boletín de campo (JSON)",
    test: ({ url }) => url.origin === SAME_ORIGIN && url.pathname === `${SCOPE_PATH}data/boletin.json`,
    handler: (event, request, label) => networkFirst(event, request, label, { tagSource: true }),
  },
  {
    label: "Consejos de observación (JSON)",
    test: ({ url }) => url.origin === SAME_ORIGIN && url.pathname === `${SCOPE_PATH}data/consejos.json`,
    handler: (event, request, label) => staleWhileRevalidate(event, request, label, { tagSource: true }),
  },
  {
    label: "API iNaturalist",
    test: ({ url }) => url.origin === INATURALIST_API_ORIGIN,
    handler: (event, request, label) => networkFirst(event, request, label, { timeoutMs: 4000 }),
  },
  {
    label: "Librería idb (CDN)",
    test: ({ url }) => url.origin === CDN_ORIGIN,
    handler: (event, request, label) => cacheFirst(event, request, label),
  },
  {
    label: "Fotos de aves",
    test: ({ request }) => request.destination === "image",
    handler: (event, request, label) => cacheFirst(event, request, label, { allowOpaque: true }),
  },
  {
    label: "Código y estilos propios",
    test: ({ request, url }) =>
      url.origin === SAME_ORIGIN &&
      (["script", "style"].includes(request.destination) || /\.(js|css)$/.test(url.pathname)),
    handler: (event, request, label) => cacheFirst(event, request, label),
  },
  {
    label: "Otro recurso propio",
    test: ({ url }) => url.origin === SAME_ORIGIN,
    handler: (event, request, label) => networkFirst(event, request, label),
  },
];

/**
 * Decide qué estrategia usar. Devuelve null cuando el SW NO debe intervenir
 * y la petición sigue su camino normal hacia la red.
 */
function chooseStrategy(request) {
  // No se atienden con caché:
  // - Métodos distintos de GET (POST, PUT, DELETE...): modifican datos y la
  //   Cache API solo guarda GET; responder desde caché sería incorrecto.
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  // - Esquemas que no son http(s) (chrome-extension:, data:, blob:).
  if (!url.protocol.startsWith("http")) return null;
  // - Peticiones parciales (Range), p. ej. audio/video: la caché no las soporta bien.
  if (request.headers.has("range")) return null;

  const route = ROUTES.find((r) => r.test({ request, url }));
  // - Otros orígenes no listados en la tabla (no los conocemos ni controlamos).
  return route || null;
}

// ─────────────────────────────────────────────────────────────────────
// 8. FETCH
// ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const route = chooseStrategy(event.request);
  if (!route) return; // el navegador la resuelve sin pasar por la caché
  event.respondWith(route.handler(event, event.request, route.label));
});