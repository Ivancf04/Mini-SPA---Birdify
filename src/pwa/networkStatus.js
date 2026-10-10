/**
 * Indicador de conectividad de Birdify.
 *
 * Dos situaciones distintas:
 *  1. El navegador sabe que no hay red (navigator.onLine === false / evento "offline").
 *     -> insignia "Sin red" + franja explicativa fija.
 *  2. Hay red, pero el servidor no responde (p. ej. se detuvo el servidor local).
 *     navigator.onLine sigue en true, así que lo avisa el Service Worker con un
 *     postMessage cuando tuvo que recurrir a la copia guardada.
 */

const TEXTOS = {
  insigniaSinRed: "Sin red",
  insigniaCopia: "Copia local",
  franjaSinRed:
    "Vas volando sin señal: Birdify sigue funcionando con lo último que guardó en este dispositivo. " +
    "Tus avistamientos se siguen guardando de forma local.",
  franjaServidor:
    "No logramos hablar con el servidor, así que te mostramos la copia guardada de: ",
  franjaRecuperada: "Señal recuperada. La próxima consulta traerá datos frescos.",
};

let hideTimer = null;

function getElements() {
  return {
    badge: document.getElementById("network-badge"),
    banner: document.getElementById("network-banner"),
  };
}

function showBanner(text, variant, autoHideMs = 0) {
  const { banner } = getElements();
  if (!banner) return;
  clearTimeout(hideTimer);
  banner.textContent = text;
  banner.dataset.variant = variant;
  banner.hidden = false;
  if (autoHideMs) {
    hideTimer = setTimeout(() => {
      banner.hidden = true;
    }, autoHideMs);
  }
}

function showBadge(text, variant) {
  const { badge } = getElements();
  if (!badge) return;
  badge.textContent = text;
  badge.dataset.variant = variant;
  badge.hidden = false;
}

function hideBadge() {
  const { badge } = getElements();
  if (badge) badge.hidden = true;
}

function renderOffline() {
  document.documentElement.dataset.network = "offline";
  showBadge(TEXTOS.insigniaSinRed, "offline");
  showBanner(TEXTOS.franjaSinRed, "offline");
  console.info("[Red] Sin conexión: la app funciona desde la caché.");
}

function renderOnline(wasOffline) {
  document.documentElement.dataset.network = "online";
  hideBadge();
  if (wasOffline) {
    showBanner(TEXTOS.franjaRecuperada, "online", 3500);
    console.info("[Red] Conexión recuperada.");
  } else {
    const { banner } = getElements();
    if (banner) banner.hidden = true;
  }
}

export function initNetworkStatus() {
  if (!navigator.onLine) renderOffline();

  window.addEventListener("offline", renderOffline);
  window.addEventListener("online", () => renderOnline(true));

  // Aviso del SW cuando sirvió una copia porque la red/servidor falló
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "BIRDIFY_CACHE_FALLBACK") return;
      if (!navigator.onLine) return; // ya se muestra el aviso de "Sin red"
      showBadge(TEXTOS.insigniaCopia, "fallback");
      showBanner(`${TEXTOS.franjaServidor}${event.data.label}.`, "fallback", 6000);
    });
  }
}
