// sw.js — service worker de birdify

console.log("[sw.js] service worker corriendo");
console.log("[sw.js] contexto global (self.constructor.name):", self.constructor.name);
console.log("[sw.js] typeof window:", typeof window);
console.log("[sw.js] typeof document:", typeof document);
console.log("[sw.js] typeof localStorage:", typeof localStorage);
console.log("[sw.js] scope (self.registration.scope):", self.registration.scope);

const CACHE_PREFIX = "birdify-shell";
const CACHE_VERSION = "v13";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;


const CDN_ORIGIN = "https://cdn.jsdelivr.net";
const INATURALIST_API_ORIGIN = "https://api.inaturalist.org";


const IDB_MODULE_URL = `${CDN_ORIGIN}/npm/idb@8.0.4/+esm`;


const INATURALIST_HOME_URL =
  `${INATURALIST_API_ORIGIN}/v1/taxa?taxon_id=3&rank=species&per_page=9&locale=es`;


const APP_SHELL = [
  // App Shell
  "./",
  "./index.html",
  "./src/utils/geolocation.js",
  "./src/utils/share.js",
  // Estilos
  "./styles/shell.css",
  "./styles/home.css",
  "./styles/sightings.css",
  "./styles/detail.css",
  "./styles/theme.css",
  "./styles/diagnostic.css",
  // Punto de entrada, router y PWA
  "./src/config.js",
  "./src/main.js",
  "./src/router/router.js",
  "./src/pwa/registerSW.js",
  "./src/pwa/networkStatus.js",
  "./src/pwa/installPrompt.js",
  "./src/pwa/notifications.js",
  "./src/pwa/pushNotifications.js",
  // Vistas (NotFoundView e ItemDetailView -> apiService se cargan con import())
  "./src/views/HomeView.js",
  "./src/views/AboutView.js",
  "./src/views/SightingsView.js",
  "./src/views/ItemDetailView.js",
  "./src/views/DiagnosticView.js",
  "./src/views/NotFoundView.js",
  "./src/views/mapa.js",
  // Componentes
  "./src/components/ItemCard.js",
  // Servicios
  "./src/services/apiService.js",
  "./src/services/dbService.js",
  "./src/services/contentService.js",
  "./src/services/syncService.js",
  // Utilidades
  "./src/utils/slugify.js",
  "./src/utils/storage.js",
  // Datos iniciales propios
  "./data/boletin.json",
  "./data/consejos.json",
  // Web App Manifest, íconos y capturas Richer Install UI
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
  "./icons/favicon-32.png",
  "./screenshots/screenshot-desktop.png",
  "./screenshots/screenshot-mobile.png",
];
const PRECACHE_LOCAL = APP_SHELL;

const PRECACHE_EXTERNAL = [IDB_MODULE_URL];

const PRECACHE_OPTIONAL = [INATURALIST_HOME_URL];

self.addEventListener("install", (event) => {
  console.log(`[SW] instalando ${CACHE_NAME}`);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

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

function shortUrl(url) {
  const u = new URL(url);
  return u.origin === self.location.origin ? u.pathname + u.search : u.host + u.pathname;
}

function log(strategy, label, message, url) {
  console.log(`[SW][${strategy}] ${label} → ${message}: ${shortUrl(url)}`);
}

function sanitizeResponse(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status || 200,
    statusText: response.statusText || "OK",
    headers: response.headers,
  });
}


function withSource(response, source) {
  const headers = new Headers(response.headers);
  headers.set("X-Birdify-Fuente", source);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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

function chooseStrategy(request) {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);

  // Excluir explícitamente todas las llamadas a la API del backend para no cachear datos dinámicos
  if (url.pathname.includes("/api/")) return null;


  if (!url.protocol.startsWith("http")) return null;
 
  if (request.headers.has("range")) return null;

  const route = ROUTES.find((r) => r.test({ request, url }));

  return route || null;
}

self.addEventListener("fetch", (event) => {
  const route = chooseStrategy(event.request);
  if (!route) return; // el navegador la resuelve sin pasar por la caché
  event.respondWith(route.handler(event, event.request, route.label));
});

const SYNC_TAG_NAME = "birdify-sync-sightings";
let configuredBackendEndpoint = "http://localhost:3000/api/sightings";


self.addEventListener("message", (event) => {
  if (event.data?.type === "BIRDIFY_SET_BACKEND_ENDPOINT" && event.data.endpoint) {
    configuredBackendEndpoint = event.data.endpoint;
    console.log("[SW] Endpoint de backend configurado:", configuredBackendEndpoint);
  }
});

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BirdifyDB", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("sightings")) {
        const s = db.createObjectStore("sightings", { keyPath: "id", autoIncrement: true });
        s.createIndex("by_category", "category", { unique: false });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const ob = db.createObjectStore("outbox", { keyPath: "clientRequestId" });
        ob.createIndex("by_status", "status", { unique: false });
        ob.createIndex("by_createdAt", "createdAt", { unique: false });
      }
    };
  });
}

function swGetAllOutbox() {
  return swOpenDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly");
      const store = tx.objectStore("outbox");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function swMarkSightingAsSynced(clientRequestId, serverResponse) {
  return swOpenDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sightings", "outbox"], "readwrite");
      const sightingsStore = tx.objectStore("sightings");
      const outboxStore = tx.objectStore("outbox");

      outboxStore.delete(clientRequestId);

      const getReq = sightingsStore.getAll();
      getReq.onsuccess = () => {
        const list = getReq.result || [];
        const target = list.find((s) => s.clientRequestId === clientRequestId);
        if (target) {
          target.syncStatus = "synced";
          target.serverConfirmed = true;
          target.syncError = null;
          target.syncedAt = new Date().toISOString();
          if (serverResponse?.sighting?.serverId) {
            target.serverId = serverResponse.sighting.serverId;
          }
          sightingsStore.put(target);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function swUpdateOutboxAttempt(clientRequestId, errorMessage) {
  return swOpenDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sightings", "outbox"], "readwrite");
      const sightingsStore = tx.objectStore("sightings");
      const outboxStore = tx.objectStore("outbox");

      const getOutbox = outboxStore.get(clientRequestId);
      getOutbox.onsuccess = () => {
        const item = getOutbox.result;
        if (item) {
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = errorMessage;
          item.status = "failed";
          item.lastAttemptAt = new Date().toISOString();
          outboxStore.put(item);
        }
      };

      const getSightings = sightingsStore.getAll();
      getSightings.onsuccess = () => {
        const list = getSightings.result || [];
        const target = list.find((s) => s.clientRequestId === clientRequestId);
        if (target) {
          target.syncStatus = "failed";
          target.syncError = errorMessage;
          sightingsStore.put(target);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

async function swShowSyncNotification(syncedItems = []) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      console.info(
        `[SW] Sincronización completada, pero el permiso de notificaciones es '${Notification.permission}' (se requiere 'granted' mediante el botón '🔔 Activar avisos').`
      );
      return false;
    }
    if (!self.registration || typeof self.registration.showNotification !== "function") {
      return false;
    }

    const list = Array.isArray(syncedItems) ? syncedItems : [];
    if (list.length === 0) return false;

    const count = list.length;
    const first = list[0] || {};
    const birdName = first.birdName ? String(first.birdName).trim() : "";
    const location = first.location ? String(first.location).trim() : "";

    const title =
      count === 1
        ? "Avistamiento sincronizado"
        : `Avistamientos sincronizados (${count})`;

    let body;
    if (count === 1 && birdName) {
      body = `Se confirmó en el servidor el registro de «${birdName}»${
        location ? ` en ${location}` : ""
      }.`;
    } else if (count > 1 && birdName) {
      body = `Se sincronizaron ${count} avistamientos pendientes con el servidor (incluyendo «${birdName}»).`;
    } else {
      body = `Se sincronizaron ${count} avistamiento(s) pendiente(s) con el servidor.`;
    }

    const icon = `${SCOPE_PATH}icons/icon-192.png`;
    const badge = `${SCOPE_PATH}icons/favicon-32.png`;
    const targetUrl = `${SCOPE_PATH}avistamientos`;

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: SYNC_TAG_NAME,
      data: {
        url: targetUrl,
        syncedCount: count,
        clientRequestId: first.clientRequestId || null,
        timestamp: new Date().toISOString(),
      },
    });
    return true;
  } catch (err) {
    console.warn("[SW] No se pudo mostrar la notificación local tras Background Sync:", err);
    return false;
  }
}

async function processOutboxQueueInSW() {
  console.log("[SW] Iniciando procesamiento de outbox desde Background Sync...");
  const items = await swGetAllOutbox();
  if (!items || items.length === 0) {
    console.log("[SW] outbox vacío, nada que sincronizar.");
    return;
  }

  const endpoint = configuredBackendEndpoint;
  let failedCount = 0;
  let lastFatalError = null;
  const syncedItems = [];

  for (const item of items) {
    try {
      console.log(`[SW] Enviando avistamiento ${item.clientRequestId} a ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-Id": item.clientRequestId,
        },
        body: JSON.stringify(item.payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch { }

      if (!response.ok) {
        const errorMsg = data?.error || `HTTP ${response.status}: ${response.statusText || "Error en servidor"}`;
        console.warn(`[SW] Respuesta de error del servidor para ${item.clientRequestId}:`, errorMsg);
        await swUpdateOutboxAttempt(item.clientRequestId, errorMsg);
        failedCount++;
        lastFatalError = new Error(errorMsg);
        await notifyClients({
          type: "BIRDIFY_SYNC_ITEM_ERROR",
          clientRequestId: item.clientRequestId,
          error: errorMsg,
        });
        continue;
      }

      // Confirmado por el servidor
      console.log(`[SW] Avistamiento confirmado por servidor: ${item.clientRequestId}`, data);
      await swMarkSightingAsSynced(item.clientRequestId, data);
      syncedItems.push({
        clientRequestId: item.clientRequestId,
        birdName: data?.sighting?.birdName || item.payload?.birdName,
        location: data?.sighting?.location || item.payload?.location,
      });
      await notifyClients({
        type: "BIRDIFY_SYNC_ITEM_SUCCESS",
        clientRequestId: item.clientRequestId,
        sighting: data.sighting,
      });
    } catch (networkError) {
      console.error(`[SW] Fallo de red/conexión al sincronizar ${item.clientRequestId}:`, networkError);
      await swUpdateOutboxAttempt(item.clientRequestId, networkError.message);
      failedCount++;
      lastFatalError = networkError;
      await notifyClients({
        type: "BIRDIFY_SYNC_ITEM_ERROR",
        clientRequestId: item.clientRequestId,
        error: networkError.message,
      });
    }
  }

  let notificationShownBySW = false;
  if (syncedItems.length > 0) {
    notificationShownBySW = await swShowSyncNotification(syncedItems);
  }

  // Notificar estado final a ventanas
  await notifyClients({
    type: "BIRDIFY_SYNC_BATCH_FINISHED",
    total: items.length,
    failed: failedCount,
    synced: items.length - failedCount,
    syncedItems,
    notificationShownBySW,
  });

  if (failedCount > 0) {
    console.warn(
      `[SW] Sync finalizado con ${failedCount} fallos. Propagando rechazo a waitUntil para programar reintento del navegador.`
    );
    throw (
      lastFatalError ||
      new Error(`[SW] Background Sync no pudo sincronizar ${failedCount} de ${items.length} operaciones.`)
    );
  }

  console.log(`[SW] Background Sync completado exitosamente (${items.length} operaciones sincronizadas).`);
}

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG_NAME) {
    // Requisito 4: Imprime "[SW] sync" junto con la tag
    console.log("[SW] sync", event.tag);
    // Pasa a event.waitUntil la promesa que procesa la cola
    event.waitUntil(processOutboxQueueInSW());
  }
});

const VALID_APP_ROUTES = new Set([
  "/",
  "/index.html",
  "/acerca",
  "/avistamientos",
  "/diagnostico",
]);

function isValidInternalRoutePath(routePath) {
  if (VALID_APP_ROUTES.has(routePath)) return true;
  if (/^\/item\/[^/]+$/.test(routePath)) return true;
  return false;
}

function resolveNotificationTargetUrl(rawUrl) {
  const scopeUrl = new URL(SCOPE_PATH, self.location.origin);
  const safeFallbackUrl = new URL(`${SCOPE_PATH}avistamientos`, self.location.origin).href;

  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return safeFallbackUrl;
  }

  try {
    const candidate = new URL(rawUrl.trim(), scopeUrl);

  
    if (candidate.origin !== self.location.origin) {
      return safeFallbackUrl;
    }

    if (candidate.hash && candidate.hash.startsWith("#/")) {
      const hashPath = candidate.hash.slice(1).split("?")[0];
      if (isValidInternalRoutePath(hashPath)) {
        return new URL(`${SCOPE_PATH}${hashPath.replace(/^\//, "")}`, self.location.origin).href;
      }
      return safeFallbackUrl;
    }

    const pathname = candidate.pathname;
    let relativeRoute = pathname;

    if (SCOPE_PATH !== "/" && pathname.startsWith(SCOPE_PATH)) {
      relativeRoute = "/" + pathname.slice(SCOPE_PATH.length);
    } else if (SCOPE_PATH !== "/" && !pathname.startsWith(SCOPE_PATH)) {
      if (isValidInternalRoutePath(pathname)) {
        return new URL(`${SCOPE_PATH}${pathname.replace(/^\//, "")}`, self.location.origin).href;
      }
      return safeFallbackUrl;
    }

    if (!isValidInternalRoutePath(relativeRoute)) {
      return safeFallbackUrl;
    }

    return new URL(`${SCOPE_PATH}${relativeRoute.replace(/^\//, "")}`, self.location.origin).href;
  } catch {
    return safeFallbackUrl;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification?.data?.url;
  const targetUrl = resolveNotificationTargetUrl(rawUrl);
  const scopeHref = new URL(SCOPE_PATH, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const appClient =
        windowClients.find((client) => client.url && client.url.startsWith(scopeHref)) ||
        windowClients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

      if (appClient) {
        if ("focus" in appClient && typeof appClient.focus === "function") {
          await appClient.focus();
        }
        if (typeof appClient.postMessage === "function") {
          appClient.postMessage({
            type: "BIRDIFY_NOTIFICATION_CLICK",
            url: targetUrl,
          });
        } else if ("navigate" in appClient && typeof appClient.navigate === "function") {
          await appClient.navigate(targetUrl);
        }
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
function normalizeScopedUrl(rawUrl, scopePath = SCOPE_PATH) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;


  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith(scopePath)) {
    return trimmed;
  }
  const scopeWithoutLeadingSlash = scopePath.replace(/^\/+/, "");
  if (scopeWithoutLeadingSlash && trimmed.startsWith(scopeWithoutLeadingSlash)) {
    return `/${trimmed}`;
  }

  const cleanRelative = trimmed.replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
  return `${scopePath}${cleanRelative}`;
}

self.addEventListener("push", (event) => {
  console.log("[sw.js] Evento 'push' recibido del servidor.");

  let payload = {
    title: "Birdify",
    body: "¡Nuevo avistamiento registrado en Birdify!",
    icon: `${SCOPE_PATH}icons/icon-192.png`,
    badge: `${SCOPE_PATH}icons/favicon-32.png`,
    tag: "birdify-sighting-push",
    data: {
      url: `${SCOPE_PATH}avistamientos`,
      timestamp: new Date().toISOString(),
    },
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = {
        ...payload,
        ...json,
        data: {
          ...payload.data,
          ...(json.data || {}),
        },
      };
    } catch {
      const text = event.data.text();
      if (text) {
        payload.body = text;
      }
    }
  }

  if (payload.icon) {
    payload.icon = normalizeScopedUrl(payload.icon, SCOPE_PATH);
  }
  if (payload.badge) {
    payload.badge = normalizeScopedUrl(payload.badge, SCOPE_PATH);
  }
  if (payload.data && payload.data.url) {
    payload.data.url = normalizeScopedUrl(payload.data.url, SCOPE_PATH);
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag || "birdify-sighting-push",
    data: payload.data,
    vibrate: [100, 50, 100],
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});