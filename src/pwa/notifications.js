/**
 * Modulo de Notificaciones Locales y Control de Permisos para Birdify
 *
 * Responsabilidades:
 * - Consultar y monitorear el estado del permiso de notificaciones (default, granted, denied, unsupported).
 * - Solicitar el permiso únicamente tras una accion explicita del usuario (clic) cuando el estado es 'default'.
 * - Nunca volver a solicitar el permiso automaticamente ni cuando el estado es 'denied'.
 * - Disparar notificaciones locales mediante registration.showNotification() cuando se confirma
 *   la sincronizacion exitosa de avistamientos con el servidor.
 * - Respetar la ruta base del proyecto (localhost '/' y GitHub Pages '/Mini-SPA---Birdify/').
 */

import { BASE_PATH, SW_SCOPE } from "./registerSW.js";

export const NOTIFICATION_TAG = "birdify-sync-sightings";

const permissionListeners = new Set();
const notifiedRequestIds = new Set();
let isMonitorInitialized = false;

/**
 * Comprueba si el navegador actual soporta las APIs necesarias para notificaciones locales de SW.
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/**
 * Obtiene el estado actual del permiso de notificaciones.
 * @returns {'default' | 'granted' | 'denied' | 'unsupported'}
 */
export function getNotificationPermissionState() {
  if (!isNotificationSupported()) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Construye la ruta válida del icono de notificación respetando la ruta base (raíz o GitHub Pages)
 * sin depender de la ruta interna actual del router.
 * @param {string} [basePath]
 * @returns {string}
 */
export function getNotificationIconPath(basePath = BASE_PATH) {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}icons/icon-192.png`;
}

/**
 * Construye la ruta válida del badge de notificación respetando la ruta base.
 * @param {string} [basePath]
 * @returns {string}
 */
export function getNotificationBadgePath(basePath = BASE_PATH) {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}icons/favicon-32.png`;
}

/**
 * Construye la URL de destino en la SPA para la notificación de avistamientos sincronizados,
 * respetando el router y la ruta base de GitHub Pages.
 * @param {string} [basePath]
 * @returns {string}
 */
export function getNotificationTargetUrl(basePath = BASE_PATH) {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}avistamientos`;
}

/**
 * Obtiene un resumen diagnóstico del estado actual de notificaciones.
 */
export function getNotificationDiagnosticState() {
  const supported = isNotificationSupported();
  const permission = getNotificationPermissionState();
  return {
    supported,
    permission,
    iconPath: getNotificationIconPath(),
    targetUrl: getNotificationTargetUrl(),
    tag: NOTIFICATION_TAG,
  };
}

/**
 * Notifica a todos los suscriptores registrados del estado actual de permisos.
 */
export function refreshNotificationPermissionState() {
  const state = getNotificationDiagnosticState();
  permissionListeners.forEach((callback) => {
    try {
      callback(state);
    } catch (err) {
      console.error("[notifications] Error en suscriptor de permisos:", err);
    }
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("birdify-notification-permission-change", {
        detail: state,
      })
    );
  }
  return state;
}

/**
 * Suscribe un callback a los cambios de estado del permiso de notificaciones.
 * Invoca el callback inmediatamente con el estado actual.
 * @param {Function} callback
 * @returns {Function} Función para cancelar la suscripción
 */
export function onNotificationPermissionChange(callback) {
  permissionListeners.add(callback);
  try {
    callback(getNotificationDiagnosticState());
  } catch (err) {
    console.error("[notifications] Error en ejecución inicial de listener:", err);
  }
  return () => permissionListeners.delete(callback);
}

/**
 * Solicita permiso de notificaciones al usuario únicamente cuando el estado es 'default'.
 * En estado 'denied' o 'granted' NO vuelve a ejecutar Notification.requestPermission().
 * @returns {Promise<{state: string, requested: boolean}>}
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    refreshNotificationPermissionState();
    return { state: "unsupported", requested: false };
  }

  const current = Notification.permission;

  // Condición crítica: en estado denied NO se vuelve a ejecutar la solicitud de permiso
  if (current === "denied") {
    console.info(
      "[notifications] Permiso en estado 'denied'. No se vuelve a invocar Notification.requestPermission()."
    );
    refreshNotificationPermissionState();
    return { state: "denied", requested: false };
  }

  if (current === "granted") {
    refreshNotificationPermissionState();
    return { state: "granted", requested: false };
  }

  try {
    const result = await Notification.requestPermission();
    refreshNotificationPermissionState();
    return { state: result, requested: true };
  } catch (error) {
    console.error("[notifications] Error al solicitar permiso de notificaciones:", error);
    refreshNotificationPermissionState();
    return { state: getNotificationPermissionState(), requested: false, error };
  }
}

/**
 * Inicializa el monitoreo pasivo del estado de permisos (sin solicitar permiso al cargar).
 * Actualiza el estado mostrado cuando el usuario vuelve a la pestaña/aplicación o cambia permisos en el navegador.
 */
export function initNotificationPermissionMonitor() {
  if (typeof window === "undefined" || isMonitorInitialized) return;
  isMonitorInitialized = true;

  // Actualizar al volver a la pestaña / ventana
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshNotificationPermissionState();
    }
  });

  window.addEventListener("focus", () => {
    refreshNotificationPermissionState();
  });

  // Escuchar cambios en vivo desde la Permissions API si el navegador lo soporta
  if ("permissions" in navigator && typeof navigator.permissions.query === "function") {
    navigator.permissions
      .query({ name: "notifications" })
      .then((status) => {
        status.addEventListener("change", () => {
          refreshNotificationPermissionState();
        });
      })
      .catch(() => {
        // Algunos navegadores no soportan 'notifications' en permissions.query; se usa focus/visibilitychange
      });
  }

  refreshNotificationPermissionState();
}

/**
 * Construye los datos (title y options) de la notificación para la sincronización confirmada.
 * @param {Array<{clientRequestId?: string, birdName?: string, location?: string}>} syncedItems
 * @param {string} [basePath]
 */
export function buildSyncNotificationPayload(syncedItems = [], basePath = BASE_PATH) {
  const list = Array.isArray(syncedItems) ? syncedItems : [];
  const count = list.length || 1;
  const first = list[0] || {};
  const birdName = first.birdName ? String(first.birdName).trim() : "";
  const location = first.location ? String(first.location).trim() : "";

  const title =
    count === 1
      ? "Avistamiento sincronizado"
      : `Avistamientos sincronizados (${count})`;

  let body;
  if (count === 1 && birdName) {
    body = `Se confirmó en el servidor el registro de «${birdName}»${location ? ` en ${location}` : ""
      }.`;
  } else if (count > 1 && birdName) {
    body = `Se sincronizaron ${count} avistamientos pendientes con el servidor (incluyendo «${birdName}»).`;
  } else {
    body = `Se sincronizaron ${count} avistamiento(s) pendiente(s) con el servidor.`;
  }

  const icon = getNotificationIconPath(basePath);
  const badge = getNotificationBadgePath(basePath);
  const targetUrl = getNotificationTargetUrl(basePath);

  return {
    title,
    options: {
      body,
      icon,
      badge,
      tag: NOTIFICATION_TAG,
      data: {
        url: targetUrl,
        syncedCount: count,
        clientRequestId: first.clientRequestId || null,
        timestamp: new Date().toISOString(),
      },
    },
  };
}

/**
 * Muestra una notificación local usando registration.showNotification() tras confirmarse
 * la sincronización de uno o más avistamientos con el servidor.
 *
 * - Solo se ejecuta si el permiso es 'granted'.
 * - Evita duplicados por clientRequestId y mediante el uso de tag estable.
 * - Captura cualquier error internamente para no afectar la operación de negocio ya completada.
 *
 * @param {Array<{clientRequestId?: string, birdName?: string, location?: string}>} syncedItems
 * @param {{ basePath?: string, registration?: ServiceWorkerRegistration }} [customOptions]
 * @returns {Promise<{shown: boolean, reason?: string, title?: string, options?: object}>}
 */
export async function notifySightingsSynced(syncedItems = [], customOptions = {}) {
  try {
    if (!isNotificationSupported()) {
      return { shown: false, reason: "unsupported" };
    }

    if (Notification.permission !== "granted") {
      return { shown: false, reason: "permission_not_granted" };
    }

    const items = Array.isArray(syncedItems) ? syncedItems : [];
    if (items.length === 0) {
      return { shown: false, reason: "empty_items" };
    }

    // Filtrar elementos cuyo clientRequestId ya fue notificado en esta sesión
    const unnotifiedItems = items.filter((item) => {
      if (!item || !item.clientRequestId) return true;
      return !notifiedRequestIds.has(item.clientRequestId);
    });

    if (unnotifiedItems.length === 0) {
      return { shown: false, reason: "already_notified" };
    }

    const basePath = customOptions.basePath || BASE_PATH;
    const registration =
      customOptions.registration ||
      (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ||
      (await navigator.serviceWorker.ready);

    if (!registration || typeof registration.showNotification !== "function") {
      return { shown: false, reason: "no_sw_registration" };
    }

    const { title, options } = buildSyncNotificationPayload(unnotifiedItems, basePath);
    await registration.showNotification(title, options);

    unnotifiedItems.forEach((item) => {
      if (item?.clientRequestId) {
        notifiedRequestIds.add(item.clientRequestId);
      }
    });

    return { shown: true, title, options };
  } catch (error) {
    // Requisito 3: Un error al mostrar una notificación no debe convertir en fallida una operación de negocio exitosa
    console.warn("[notifications] No se pudo mostrar la notificación local:", error);
    return { shown: false, reason: "error", error };
  }
}

/**
 * Permite limpiar el registro de IDs notificados en pruebas automatizadas.
 */
export function resetNotifiedIdsForTesting() {
  notifiedRequestIds.clear();
}

