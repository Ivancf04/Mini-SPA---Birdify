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
  "./index.html",
  "./styles/shell.css",
  "./styles/home.css",
  "./styles/sightings.css",
  "./styles/detail.css",
  "./styles/theme.css",
  "./styles/diagnostic.css",
  "./src/main.js",
];

//Precache en install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL_FILES);
    })
  );
});

//Limpieza de versiones viejas en activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    })
  );
});