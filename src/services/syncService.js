/**
 * syncService.js — Coordinador centralizado de sincronización Offline-First
 * 
 * Gestiona el registro de Background Sync con la tag "birdify-sync-sightings"
 * y el Plan B de reintentos (al abrir la app, al recuperar conexión 'online' y al pulsar "Reintentar").
 * Incluye opción de diagnóstico reversible para simular falta de soporte de Background Sync.
 */

import {
  getAllOutbox,
  getOutboxCount,
  markSightingAsSynced,
  updateOutboxAttempt,
  markSightingAsSyncing,
} from "./dbService.js";

export const SYNC_TAG = "birdify-sync-sightings";
export const DEFAULT_API_ENDPOINT = "http://localhost:3000/api/sightings";
export const STORAGE_KEY_API_ENDPOINT = "birdify_api_endpoint";
export const STORAGE_KEY_FORCE_PLAN_B = "birdify_force_plan_b";

// Bandera para evitar ejecuciones concurrentes del Plan B en la pestaña
let isProcessingQueue = false;

/**
 * Obtiene el endpoint efectivo del servidor backend
 */
export function getApiEndpoint() {
  if (typeof localStorage !== "undefined") {
    const custom = localStorage.getItem(STORAGE_KEY_API_ENDPOINT);
    if (custom && custom.trim()) return custom.trim();
  }
  return DEFAULT_API_ENDPOINT;
}

/**
 * Guarda un nuevo endpoint de backend personalizado
 */
export function setApiEndpoint(url) {
  if (typeof localStorage !== "undefined") {
    if (!url) {
      localStorage.removeItem(STORAGE_KEY_API_ENDPOINT);
    } else {
      localStorage.setItem(STORAGE_KEY_API_ENDPOINT, url.trim());
    }
    dispatchSyncStatusChange();
  }
}

/**
 * Comprueba si el modo Plan B está forzado mediante:
 * 1. Parámetro de URL (?forcePlanB=1 o ?planb=true)
 * 2. Opción reversible guardada en localStorage ('birdify_force_plan_b' === 'true')
 */
export function isPlanBForced() {
  if (typeof window === "undefined") return false;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("forcePlanB") === "1" || urlParams.get("planb") === "true") {
    return true;
  }

  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(STORAGE_KEY_FORCE_PLAN_B) === "true";
  }

  return false;
}

/**
 * Alterna o establece la simulación de falta de soporte de Background Sync
 * @param {boolean} force
 */
export function setForcePlanB(force) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY_FORCE_PLAN_B, force ? "true" : "false");
    dispatchSyncStatusChange();
  }
}

/**
 * Evalúa si el navegador soporta Background Sync nativamente
 */
export function isNativeBackgroundSyncSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window;
}

/**
 * Decisión centralizada: ¿Se debe usar Background Sync?
 * Falso si el navegador no lo soporta o si está activada la simulación reversible de Plan B.
 */
export function isBackgroundSyncActive() {
  if (isPlanBForced()) return false;
  return isNativeBackgroundSyncSupported();
}

/**
 * Retorna la etiqueta descriptiva del modo actual para mostrar en la interfaz
 */
export function getSyncModeLabel() {
  if (isBackgroundSyncActive()) {
    return "Modo Background Sync";
  }
  return "Modo compatible: reintentos al abrir, recuperar conexión o pulsar el botón";
}

/**
 * Dispara evento en la ventana para actualizar componentes visuales
 */
export function dispatchSyncStatusChange(detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("birdify-sync-change", { detail }));
  }
}

/**
 * Intenta registrar la tag en Background Sync.
 * Si no está soportado o falla el registro, activa inmediatamente el Plan B.
 */
export async function scheduleOrTriggerSync() {
  // Si el navegador está completamente desconectado (offline), no intentar un fetch fallido;
  // se conserva en outbox con estado naranja 'pending' hasta que regrese la conexión.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[SyncService] Navegador sin conexión (offline). El registro permanece en outbox como pendiente.");
    if (isBackgroundSyncActive()) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ("sync" in registration && typeof registration.sync.register === "function") {
          await registration.sync.register(SYNC_TAG);
          console.log(`[SyncService] Tag '${SYNC_TAG}' registrada para ejecutarse automáticamente al recuperar red.`);
        }
      } catch (err) {
        console.warn("[SyncService] No se pudo pre-registrar sync offline:", err);
      }
    }
    dispatchSyncStatusChange({ mode: "offline-waiting", offline: true });
    return { success: true, mode: "offline-waiting", reason: "offline" };
  }

  // 1. Si está en modo compatible / forzado: ejecutar Plan B directamente
  if (!isBackgroundSyncActive()) {
    console.log("[SyncService] Modo compatible activo. Ejecutando procesamiento con Plan B...");
    return await processOutboxQueuePlanB("plan-b-triggered");
  }

  // 2. Intentar registrar en Background Sync
  try {
    const registration = await navigator.serviceWorker.ready;
    if ("sync" in registration && typeof registration.sync.register === "function") {
      await registration.sync.register(SYNC_TAG);
      console.log(`[SyncService] Tag '${SYNC_TAG}' registrada exitosamente en Background Sync.`);
      dispatchSyncStatusChange({ mode: "background-sync", registered: true });
      return { success: true, mode: "background-sync" };
    } else {
      console.warn("[SyncService] registration.sync no disponible. Usando Plan B...");
      return await processOutboxQueuePlanB("fallback-no-sync-on-reg");
    }
  } catch (error) {
    console.warn("[SyncService] Falló registration.sync.register:", error);
    // Conservar la cola y activar Plan B
    dispatchSyncStatusChange({ mode: "plan-b-fallback", error: error.message });
    return await processOutboxQueuePlanB("fallback-on-error");
  }
}

/**
 * PLAN B: Procesa la cola outbox directamente desde la página cuando
 * Background Sync no está disponible o ante reintento manual/conexión recuperada.
 */
export async function processOutboxQueuePlanB(triggerReason = "manual") {
  if (isProcessingQueue) {
    console.log(`[SyncService][Plan B] Procesamiento ya en curso (trigger: ${triggerReason}). Omitiendo llamada concurrente.`);
    return { skipped: true, reason: "in_progress" };
  }

  // Si no hay conexión a internet, esperar al evento 'online' sin marcar como error fallido
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[SyncService][Plan B] Sin conexión (offline). Las operaciones permanecen pendientes en outbox.");
    dispatchSyncStatusChange({ isSyncing: false, offline: true });
    return { total: 0, synced: 0, failed: 0, offline: true };
  }

  isProcessingQueue = true;
  dispatchSyncStatusChange({ isSyncing: true, triggerReason });

  const endpoint = getApiEndpoint();
  const results = {
    total: 0,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    const items = await getAllOutbox();
    results.total = items.length;

    if (items.length === 0) {
      console.log(`[SyncService][Plan B] Cola outbox vacía. Nada que sincronizar.`);
      return results;
    }

    console.log(`[SyncService][Plan B] Iniciando sincronización de ${items.length} operaciones hacia: ${endpoint}`);

    for (const item of items) {
      try {
        await markSightingAsSyncing(item.clientRequestId);
        dispatchSyncStatusChange({ syncingId: item.clientRequestId });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Request-Id": item.clientRequestId,
          },
          body: JSON.stringify(item.payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let data = null;
        try {
          data = await response.json();
        } catch {
          // Payload sin JSON legible
        }

        if (!response.ok) {
          const errMsg = data?.error || `HTTP ${response.status}: ${response.statusText || "Error en servidor"}`;
          console.warn(`[SyncService][Plan B] Servidor respondió con error para ${item.clientRequestId}:`, errMsg);
          await updateOutboxAttempt(item.clientRequestId, errMsg);
          results.failed++;
          results.errors.push({ id: item.clientRequestId, error: errMsg });
          continue;
        }

        // Éxito: confirmación definida por el contrato del backend (ok: true)
        console.log(`[SyncService][Plan B] Avistamiento confirmado por servidor: ${item.clientRequestId}`, data);
        await markSightingAsSynced(item.clientRequestId, data);
        results.synced++;
      } catch (err) {
        const errorMsg = err.name === "AbortError"
          ? "Timeout de red al conectar con el servidor"
          : (err.message || "Fallo de red o servidor no disponible");

        console.warn(`[SyncService][Plan B] Error al enviar ${item.clientRequestId}:`, errorMsg);
        await updateOutboxAttempt(item.clientRequestId, errorMsg);
        results.failed++;
        results.errors.push({ id: item.clientRequestId, error: errorMsg });
      }
    }
  } finally {
    isProcessingQueue = false;
    dispatchSyncStatusChange({ isSyncing: false, results });
  }

  return results;
}

/**
 * Inicializa los escuchadores automáticos del Plan B:
 * 1. Al abrir la aplicación.
 * 2. Cuando el navegador recupere la conexión ('online').
 * 3. Escucha mensajes de sincronización del Service Worker.
 */
export function initSyncCoordinator() {
  if (typeof window === "undefined") return;

  // 1. Al abrir la aplicación: si hay pendientes y hay red, procesar cola
  if (navigator.onLine) {
    getOutboxCount().then((count) => {
      if (count > 0) {
        console.log(`[SyncService] Inicio de app: se detectaron ${count} operaciones pendientes. Intentando sincronizar...`);
        scheduleOrTriggerSync();
      }
    });
  }

  // 2. Al recuperar conexión
  window.addEventListener("online", () => {
    console.log("[SyncService] Evento 'online' disparado en ventana. Procesando cola...");
    scheduleOrTriggerSync();
  });

  // 3. Escuchar notificaciones desde el Service Worker (Background Sync)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data;
      if (data && data.type && data.type.startsWith("BIRDIFY_SYNC_")) {
        console.log("[SyncService] Mensaje recibido del Service Worker:", data);
        dispatchSyncStatusChange({ fromSW: true, message: data });
      }
    });
  }
}
