//Capa de persistencia: localStorage, sessionStorage y Cookies

export const KEYS = {
  THEME: "birdify:theme",
  HOME_SEARCH: "birdify:homeSearch",
  VISITS_COOKIE: "birdify_visits",
};

//Aviso no bloqueante
export function notifyStorageIssue(message) {
  console.warn(`[Persistencia] ${message}`);

  // Evita apilar varios toasts idénticos si fallan varias llamadas seguidas
  if (document.querySelector(".storage-toast")) return;

  const toast = document.createElement("div");
  toast.className = "storage-toast";
  toast.setAttribute("role", "status");
  toast.textContent = `⚠️ ${message}`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

//localStorage
export function getLocal(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch (err) {
    notifyStorageIssue("No se pudo leer localStorage. Se usará un valor por defecto.");
    return fallback;
  }
}

export function setLocal(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    // Cubre tanto "localStorage no disponible" como "QuotaExceededError"
    notifyStorageIssue("No se pudo guardar en localStorage (deshabilitado o sin espacio). Esta preferencia no se recordará.");
    return false;
  }
}

export function removeLocal(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (err) {
    notifyStorageIssue("No se pudo limpiar localStorage.");
    return false;
  }
}

//sessionStorage
export function getSession(key, fallback = null) {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch (err) {
    notifyStorageIssue("No se pudo leer sessionStorage.");
    return fallback;
  }
}

export function setSession(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch (err) {
    notifyStorageIssue("No se pudo guardar en sessionStorage (deshabilitado o sin espacio).");
    return false;
  }
}

export function removeSession(key) {
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch (err) {
    notifyStorageIssue("No se pudo limpiar sessionStorage.");
    return false;
  }
}

//Cookies
export function setCookie(name, value, days) {
  try {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie =
      `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
    return true;
  } catch (err) {
    notifyStorageIssue("No se pudo guardar la cookie.");
    return false;
  }
}

export function getCookie(name) {
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split("=")[1]) : null;
  } catch (err) {
    notifyStorageIssue("No se pudo leer la cookie.");
    return null;
  }
}

export function deleteCookie(name) {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    return true;
  } catch (err) {
    notifyStorageIssue("No se pudo eliminar la cookie.");
    return false;
  }
}