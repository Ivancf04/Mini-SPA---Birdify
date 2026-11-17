/**
 * src/pwa/pushNotifications.js — Web Push Notification Manager for Birdify PWA
 *
 * Responsibilities:
 * - Detect PushManager & Notification API support.
 * - Manage VAPID public key retrieval and base64url decoding.
 * - Manage subscription and unsubscription lifecycles against navigator.serviceWorker.
 * - Synchronize active subscriptions with backend (/api/subscribe, /api/unsubscribe).
 * - Perform automatic subscription resync on startup when permission is granted.
 */

import { API_ENDPOINTS, getUserId, getApiBaseUrl } from "../config.js";

const pushStateListeners = new Set();

/**
 * Checks whether the browser supports Service Worker PushManager and Notifications.
 * @returns {boolean}
 */
export function isPushManagerSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Converts a VAPID base64url string to a Uint8Array required by PushManager.subscribe.
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== "string") {
    throw new Error("urlBase64ToUint8Array: Cadena base64 inválida o ausente.");
  }

  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Compares the applicationServerKey of an active PushSubscription against
 * the current Base64URL VAPID public key served by the backend.
 * @param {PushSubscription} subscription
 * @param {string} serverPublicKey
 * @returns {boolean}
 */
export function doesSubscriptionMatchServerKey(subscription, serverPublicKey) {
  const keyBuffer = subscription?.options?.applicationServerKey;
  if (!keyBuffer || !serverPublicKey) {
    return false;
  }

  const existingBytes =
    keyBuffer instanceof ArrayBuffer
      ? new Uint8Array(keyBuffer)
      : ArrayBuffer.isView(keyBuffer)
        ? new Uint8Array(keyBuffer.buffer, keyBuffer.byteOffset, keyBuffer.byteLength)
        : null;

  if (!existingBytes) return false;

  const serverBytes = urlBase64ToUint8Array(serverPublicKey);
  if (existingBytes.length !== serverBytes.length) return false;

  for (let i = 0; i < existingBytes.length; i++) {
    if (existingBytes[i] !== serverBytes[i]) return false;
  }
  return true;
}

/**
 * Gets the current active PushSubscription, or null if none exists.
 * @returns {Promise<PushSubscription|null>}
 */
export async function getPushSubscription() {
  if (!isPushManagerSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration || !registration.pushManager) return null;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.warn("[pushNotifications] Error al consultar PushSubscription:", error);
    return null;
  }
}

/**
 * Registers a listener to be notified when push subscription state changes.
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function onPushStateChange(callback) {
  pushStateListeners.add(callback);
  return () => pushStateListeners.delete(callback);
}

/**
 * Broadcasts push state change to all listeners.
 */
export async function dispatchPushStateChange(detail = {}) {
  const state = await getPushDiagnosticState();
  const fullDetail = { ...state, ...detail };

  pushStateListeners.forEach((callback) => {
    try {
      callback(fullDetail);
    } catch (err) {
      console.error("[pushNotifications] Error en listener de estado push:", err);
    }
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("birdify-push-change", { detail: fullDetail }));
  }
}

/**
 * Subscribes to Web Push notifications:
 * 1. Requests Notification permission if not already granted.
 * 2. Fetches VAPID public key from backend.
 * 3. Calls PushManager.subscribe() with applicationServerKey.
 * 4. Sends subscription payload + user_id to backend POST /api/subscribe.
 *
 * @returns {Promise<{ ok: boolean, subscription?: PushSubscription, error?: string, reason?: string }>}
 */
export async function subscribeToPush(userId = getUserId()) {
  if (!isPushManagerSupported()) {
    const error = "Web Push no está soportado en este navegador o contexto.";
    console.warn("[pushNotifications]", error);
    return { ok: false, error, reason: "unsupported" };
  }

  // 1. Verificar o solicitar permiso de notificación
  let permission = Notification.permission;
  if (permission === "denied") {
    return {
      ok: false,
      reason: "permission_denied",
      error: "Las notificaciones están bloqueadas. Habilítalas en los permisos del sitio del navegador.",
    };
  }

  if (permission !== "granted") {
    permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await dispatchPushStateChange({ permission });
      return {
        ok: false,
        reason: "permission_denied",
        error: "El permiso de notificaciones fue denegado por el usuario.",
      };
    }
  }

  try {
    // 2. Obtener clave pública VAPID desde el backend
    const vapidUrl = API_ENDPOINTS.vapidPublicKey();
    console.log(`[pushNotifications] Solicitando clave pública VAPID desde ${vapidUrl}...`);
    const vapidResponse = await fetch(vapidUrl);
    if (!vapidResponse.ok) {
      throw new Error(`Error al obtener clave VAPID: HTTP ${vapidResponse.status} ${vapidResponse.statusText}`);
    }

    const vapidData = await vapidResponse.json();
    if (!vapidData.publicKey) {
      throw new Error("El servidor no devolvió una clave pública VAPID válida.");
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidData.publicKey);

    // 3. Obtener registro de Service Worker y suscribir con PushManager
    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      throw new Error("registration.pushManager no está disponible en el Service Worker.");
    }

    let subscription = await registration.pushManager.getSubscription();

    // Si ya existe una suscripción previa, verificar si coincide con la clave VAPID vigente
    if (subscription) {
      const keyMatches = doesSubscriptionMatchServerKey(subscription, vapidData.publicKey);
      if (keyMatches) {
        console.log("[pushNotifications] Suscripción local existente con clave VAPID vigente. Re-enviando al servidor...");
      } else {
        console.warn("[pushNotifications] Suscripción existente tiene clave VAPID distinta. Renovando suscripción...");
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      console.log("[pushNotifications] Creando nueva PushSubscription en PushManager...");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // 4. Enviar suscripción al backend con user_id
    const rawSub = subscription.toJSON();
    const subscribePayload = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawSub.keys?.p256dh,
        auth: rawSub.keys?.auth,
      },
      user_id: userId,
    };

    const subscribeUrl = API_ENDPOINTS.subscribe();
    console.log(`[pushNotifications] Registrando suscripción en backend: ${subscribeUrl}...`);
    const serverResponse = await fetch(subscribeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscribePayload),
    });

    const serverData = await serverResponse.json();
    if (!serverResponse.ok) {
      throw new Error(serverData.error || `HTTP ${serverResponse.status} al registrar suscripción.`);
    }

    console.log("[pushNotifications] Suscripción completada exitosamente:", serverData);
    await dispatchPushStateChange({ subscribed: true, subscription });

    return {
      ok: true,
      subscription,
      serverData,
    };
  } catch (error) {
    console.error("[pushNotifications] Error al suscribir a notificaciones push:", error);
    await dispatchPushStateChange({ error: error.message });
    return {
      ok: false,
      error: error.message || "Error al completar suscripción push.",
      reason: "subscription_failed",
    };
  }
}

/**
 * Unsubscribes from Web Push notifications:
 * 1. Retrieves current subscription.
 * 2. Unsubscribes locally via sub.unsubscribe().
 * 3. Informs backend to delete subscription from Supabase via POST /api/unsubscribe.
 *
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function unsubscribeFromPush() {
  if (!isPushManagerSupported()) {
    return { ok: false, error: "PushManager no soportado." };
  }

  try {
    const subscription = await getPushSubscription();
    if (!subscription) {
      console.log("[pushNotifications] No hay suscripción activa para cancelar.");
      await dispatchPushStateChange({ subscribed: false });
      return { ok: true, message: "No había suscripción activa." };
    }

    // 1. Notificar al backend de la desuscripción
    const unsubscribeUrl = API_ENDPOINTS.unsubscribe();
    try {
      await fetch(unsubscribeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      console.log("[pushNotifications] Backend notificado de desuscripción.");
    } catch (netErr) {
      console.warn("[pushNotifications] Advertencia: no se pudo notificar al backend de la desuscripción:", netErr);
    }

    // 2. Desuscribir en el cliente
    const success = await subscription.unsubscribe();
    console.log("[pushNotifications] Desuscripción local en navegador:", success);

    await dispatchPushStateChange({ subscribed: false, subscription: null });
    return { ok: true, unsubscribed: success };
  } catch (error) {
    console.error("[pushNotifications] Error al cancelar suscripción push:", error);
    return { ok: false, error: error.message };
  }
}

/**
 * Synchronizes existing push subscription with backend on application startup
 * if notification permission is already granted.
 *
 * @returns {Promise<{ ok: boolean, resynced?: boolean, reason?: string, error?: string }>}
 */
export async function syncPushSubscriptionOnStartup(userId = getUserId()) {
  if (!isPushManagerSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  if (Notification.permission !== "granted") {
    console.log("[pushNotifications] Permiso no concedido al inicio; resincronización omitida.");
    return { ok: false, reason: "not_granted" };
  }

  try {
    const subscription = await getPushSubscription();
    if (!subscription) {
      console.log("[pushNotifications] Sin suscripción activa al inicio.");
      return { ok: false, reason: "no_subscription" };
    }

    // Consultar clave pública VAPID vigente para detectar rotación de claves
    const vapidRes = await fetch(API_ENDPOINTS.vapidPublicKey());
    if (!vapidRes.ok) {
      throw new Error(`No se pudo verificar la clave VAPID vigente: HTTP ${vapidRes.status}`);
    }
    const vapidData = await vapidRes.json();
    if (!vapidData?.publicKey) {
      throw new Error("El servidor no devolvió una clave pública VAPID válida.");
    }

    if (!doesSubscriptionMatchServerKey(subscription, vapidData.publicKey)) {
      console.warn("[pushNotifications] Clave VAPID rotada o incompatible detectada al inicio. Re-suscribiendo...");
      await subscription.unsubscribe();
      const resubResult = await subscribeToPush(userId);
      return {
        ...resubResult,
        resynced: resubResult.ok,
        rotated: true,
      };
    }

    console.log("[pushNotifications] Resincronizando suscripción existente con el backend...");
    const rawSub = subscription.toJSON();
    const payload = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawSub.keys?.p256dh,
        auth: rawSub.keys?.auth,
      },
      user_id: userId,
    };

    const response = await fetch(API_ENDPOINTS.subscribe(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("[pushNotifications] Resincronización al inicio finalizada:", data);
    await dispatchPushStateChange({ subscribed: true, subscription });

    return { ok: true, resynced: true, data };
  } catch (error) {
    console.warn("[pushNotifications] No se pudo resincronizar la suscripción al inicio:", error);
    return { ok: false, error: error.message };
  }
}

/**
 * Generates a full diagnostic status object for Push Notifications.
 */
export async function getPushDiagnosticState() {
  const supported = isPushManagerSupported();
  const permission = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  let subscription = null;
  let isSubscribed = false;

  if (supported) {
    subscription = await getPushSubscription();
    isSubscribed = Boolean(subscription);
  }

  return {
    supported,
    permission,
    isSubscribed,
    endpoint: subscription?.endpoint || null,
    keys: subscription ? subscription.toJSON()?.keys || null : null,
    userId: getUserId(),
    apiBaseUrl: getApiBaseUrl(),
    endpoints: {
      vapid: API_ENDPOINTS.vapidPublicKey(),
      subscribe: API_ENDPOINTS.subscribe(),
      unsubscribe: API_ENDPOINTS.unsubscribe(),
      sightings: API_ENDPOINTS.sightings(),
    },
  };
}
