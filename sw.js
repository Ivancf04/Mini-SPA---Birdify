// sw.js — Service Worker para Birdify (Precaching y versionado del App Shell)

console.log("[sw.js] Service Worker ejecutado exitosamente.");
console.log("[sw.js] Contexto global (self.constructor.name):", self.constructor.name);
console.log("[sw.js] typeof window:", typeof window);
console.log("[sw.js] typeof document:", typeof document);
console.log("[sw.js] typeof localStorage:", typeof localStorage);
console.log("[sw.js] Scope (self.registration.scope):", self.registration.scope);

//Constante de versión
const CACHE_VERSION = "birdify-shell-v1";

//Lista de recursos del App Shell
const APP_SHELL_FILES = [
  "./",
  "./styles/shell.css",
  "./styles/home.css",
  "./styles/sightings.css",
  "./styles/detail.css",
  "./styles/theme.css",
  "./styles/diagnostic.css",
  "./src/main.js",
];

// Precache en evento install
self.addEventListener("install", (event) => {
  console.log(`[SW] Instalando versión: ${CACHE_VERSION}`);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log("[SW] Precacheando App Shell...");
      return cache.addAll(APP_SHELL_FILES).catch((err) => {
        console.warn("[SW] Advertencia en cache.addAll, asegurando precache:", err);
        return Promise.all(
          APP_SHELL_FILES.map((url) =>
            fetch(url)
              .then((res) => {
                if (res.ok) return cache.put(url, res);
              })
              .catch((e) => console.warn(`[SW] Falló precache de ${url}:`, e))
          )
        );
      });
    })
  );
});

// Limpieza de versiones anteriores en evento activate
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activando versión: ${CACHE_VERSION}`);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_VERSION)
            .map((name) => {
              console.log(`[SW] Eliminando caché obsoleta: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Función auxiliar para limpiar respuestas con redirección (ej. 301 de servidores locales)
function sanitizeResponse(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status || 200,
    statusText: response.statusText || "OK",
    headers: response.headers,
  });
}

//Evento fetch
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  //FILTRO 1 — Solo atender peticiones GET
  if (event.request.method !== "GET") {
    return;
  }

  //FILTRO 2 — Solo atender peticiones del mismo origen
  if (url.origin !== self.location.origin) {
    return;
  }

  //Navegaciones del Router SPA (request.mode === "navigate")
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cachedIndex =
          (await cache.match("./")) || (await cache.match("./index.html"));
        if (cachedIndex) {
          console.log(`[SW] HIT (Navegación -> App Shell): ${event.request.url}`);
          return sanitizeResponse(cachedIndex);
        }
        console.log(`[SW] MISS (Navegación): ${event.request.url}`);
        return fetch(event.request);
      })
    );
    return;
  }
  
  //Estrategia Cache First con Guardado en Runtime
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      //Busqueda previa en cache con registro HIT / MISS
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        console.log(`[SW] HIT: ${event.request.url}`);
        return sanitizeResponse(cachedResponse);
      }
      console.log(`[SW] MISS: ${event.request.url}`);
      try {
        // Petición a la red si no estaba en caché
        const networkResponse = await fetch(event.request);

        //Guardado en runtime solo si response.ok (status 200-299)
        //Por que: No debemos almacenar respuestas erróneas (404, 500) en cache.
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          event.waitUntil(cache.put(event.request, responseClone));
        }
        return networkResponse;
      } catch (error) {
        console.error(`[SW] Error de red al solicitar: ${event.request.url}`, error);
        throw error;
      }
    })
  );
});