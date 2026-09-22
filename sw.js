// sw.js — Service Worker básico para Birdify (Práctica 1 — Registro y Scope)
// Restricciones: NO usar install, activate, fetch, caches, skipWaiting() ni clients.claim()

console.log("[sw.js] Service Worker ejecutado exitosamente.");
console.log("[sw.js] Contexto global (self.constructor.name):", self.constructor.name);
console.log("[sw.js] typeof window:", typeof window);
console.log("[sw.js] typeof document:", typeof document);
console.log("[sw.js] typeof localStorage:", typeof localStorage);
console.log("[sw.js] Scope (self.registration.scope):", self.registration.scope);
