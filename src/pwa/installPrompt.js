/**
 * Modulo de gestion de instalacion PWA (beforeinstallprompt y appinstalled)
 *
 * Requisito 3: Captura del evento beforeinstallprompt y appinstalled,
 * cancelacion del comportamiento por defecto, almacenamiento del evento,
 * y exposicion de la funcion promptInstall() que devuelve la decision del usuario.
 * Se inicializa inmediatamente al arrancar la app.
 */

let deferredPrompt = null;
const stateChangeListeners = new Set();

/**
 * Detecta si la aplicacion se esta ejecutando en modo instalado (standalone)
 * Comprueba media query display-mode (estándar) y navigator.standalone (iOS Safari).
 * @returns {boolean}
 */
export function isRunningStandalone() {
  const isStandaloneMQ =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;

  const isIOSStandalone = window.navigator.standalone === true;
  const isAndroidTWA = document.referrer?.startsWith("android-app://");

  return Boolean(isStandaloneMQ || isIOSStandalone || isAndroidTWA);
}

/**
 * Detecta si el dispositivo actual es iOS o iPadOS
 * @returns {boolean}
 */
export function isIOSDevice() {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIPad =
    navigator.maxTouchPoints > 1 && /macintosh/.test(ua);
  return /iphone|ipad|ipod/.test(ua) || isIPad;
}

/**
 * Comprueba si el evento de instalacion diferido se encuentra disponible
 * @returns {boolean}
 */
export function isInstallPromptAvailable() {
  return Boolean(deferredPrompt && !isRunningStandalone());
}

/**
 * Retorna un resumen del estado actual de instalacion
 */
export function getInstallDiagnosticState() {
  return {
    canPrompt: isInstallPromptAvailable(),
    isStandalone: isRunningStandalone(),
    isIOS: isIOSDevice(),
    hasDeferredPrompt: Boolean(deferredPrompt),
  };
}

/**
 * Notifica a todos los escuchas sobre un cambio en el estado de instalabilidad
 */
function notifyListeners() {
  const state = getInstallDiagnosticState();
  stateChangeListeners.forEach((callback) => {
    try {
      callback(state);
    } catch (err) {
      console.error("[installPrompt] Error en suscriptor de estado:", err);
    }
  });

  // Emite evento en el objeto window para componentes desacoplados
  window.dispatchEvent(
    new CustomEvent("pwa:installstatechange", { detail: state })
  );
}

/**
 * Registra un callback que sera invocado cuando cambie el estado de instalacion.
 * Se invoca inmediatamente con el estado actual.
 * @param {Function} callback
 * @returns {Function} Funcion de desuscripcion
 */
export function onInstallStateChange(callback) {
  stateChangeListeners.add(callback);
  // Ejecutar inmediatamente con estado actual
  try {
    callback(getInstallDiagnosticState());
  } catch (err) {
    console.error("[installPrompt] Error en ejecucion inicial de listener:", err);
  }
  return () => stateChangeListeners.delete(callback);
}

/**
 * Inicializa la captura de eventos beforeinstallprompt y appinstalled.
 * DEBE llamarse al arrancar la app en main.js (no al abrir una vista).
 */
export function initInstallPrompt() {
  console.log("[installPrompt] Inicializando listeners de instalacion PWA...");

  // 1. Captura del evento beforeinstallprompt
  window.addEventListener("beforeinstallprompt", (event) => {
    // Requisito 3: Cancele el comportamiento por defecto
    event.preventDefault();

    // Requisito 3: Guarde el evento
    deferredPrompt = event;
    console.log(
      "[installPrompt] Evento 'beforeinstallprompt' capturado y guardado con éxito.",
      { platforms: event.platforms }
    );

    // Notificar a la UI (ej. mostrar boton de instalar en el Shell)
    notifyListeners();
  });

  // 2. Captura del evento appinstalled
  window.addEventListener("appinstalled", (event) => {
    console.log("[installPrompt] Evento 'appinstalled': la app fue instalada.");
    deferredPrompt = null;
    notifyListeners();
  });

  // 3. Monitorear cambios en display-mode en vivo
  try {
    const standaloneMQ = window.matchMedia("(display-mode: standalone)");
    standaloneMQ.addEventListener("change", (e) => {
      console.log("[installPrompt] Cambio en display-mode standalone:", e.matches);
      notifyListeners();
    });
  } catch (err) {
    // Navegadores antiguos que no soportan addEventListener en matchMedia
  }

  // Notificar estado inicial al arrancar
  notifyListeners();
}

/**
 * Invoca el prompt nativo de instalacion guardado y retorna la eleccion del usuario.
 * @returns {Promise<{outcome: 'accepted'|'dismissed'|'unavailable', platform: string|null}>}
 */
export async function promptInstall() {
  if (!deferredPrompt) {
    console.warn(
      "[installPrompt] promptInstall() llamado pero no hay evento guardado."
    );
    return { outcome: "unavailable", platform: null };
  }

  try {
    console.log("[installPrompt] Disparando deferredPrompt.prompt()...");
    // Requisito 3: Llama a prompt()
    await deferredPrompt.prompt();

    // Requisito 3: Devuelve lo que el usuario eligió
    const choiceResult = await deferredPrompt.userChoice;
    console.log("[installPrompt] Resultado de la eleccion del usuario:", choiceResult);

    // El evento queda consumido y no puede volver a llamarse
    deferredPrompt = null;
    notifyListeners();

    return choiceResult;
  } catch (error) {
    console.error("[installPrompt] Error al disparar promptInstall:", error);
    deferredPrompt = null;
    notifyListeners();
    throw error;
  }
}
