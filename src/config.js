/**
 * src/config.js — Centralized Configuration for Birdify PWA
 *
 * Centralizes:
 * - Application base path (localhost '/' vs GitHub Pages '/Mini-SPA---Birdify/')
 * - Service Worker path and scope
 * - Dynamic Backend API Base URL and endpoints
 * - Default user session identifier for Supabase persistence
 */

const isGithubPages =
  typeof window !== "undefined" &&
  window.location.hostname.endsWith("github.io");

const pathSegments =
  typeof window !== "undefined"
    ? window.location.pathname.split("/").filter(Boolean)
    : [];

export const BASE_PATH =
  isGithubPages && pathSegments.length > 0 ? `/${pathSegments[0]}/` : "/";

export const SW_PATH = `${BASE_PATH}sw.js`;
export const SW_SCOPE = BASE_PATH;

export const STORAGE_KEY_API_BASE = "birdify_api_base_url";
export const STORAGE_KEY_USER_ID = "birdify_user_id";

// Default user UUID corresponding to ivanroko109 in Supabase public.users
export const DEFAULT_USER_ID = "0f99790f-05a5-4049-8605-3180bbe889cb";

// Production backend deployed on Vercel
export const DEFAULT_PRODUCTION_BACKEND_URL = "https://mini-spa-birdify.vercel.app";

/**
 * Resolves the dynamic backend API base URL:
 * 1. Custom URL saved in localStorage ('birdify_api_base_url')
 * 2. In local development (localhost or 127.0.0.1): defaults to 'http://localhost:3000'
 * 3. In production (GitHub Pages): defaults to DEFAULT_PRODUCTION_BACKEND_URL
 */
export function getApiBaseUrl() {
  if (typeof localStorage !== "undefined") {
    try {
      const custom = localStorage.getItem(STORAGE_KEY_API_BASE);
      if (custom && custom.trim()) {
        return custom.trim().replace(/\/+$/, "");
      }
    } catch {
      // Storage access disabled or restricted
    }
  }

  if (typeof window !== "undefined" && window.location) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

    if (isLocalhost) {
      if (window.location.port === "3000") {
        return window.location.origin;
      }
      return "http://localhost:3000";
    }

    // In production (e.g. GitHub Pages), connect directly to Vercel backend
    return DEFAULT_PRODUCTION_BACKEND_URL;
  }

  // Node.js or test runner environment fallback
  return "http://localhost:3000";
}

/**
 * Sets or removes the custom backend API base URL in localStorage
 * @param {string|null} url
 */
export function setApiBaseUrl(url) {
  if (typeof localStorage !== "undefined") {
    try {
      if (!url || !url.trim()) {
        localStorage.removeItem(STORAGE_KEY_API_BASE);
      } else {
        localStorage.setItem(STORAGE_KEY_API_BASE, url.trim().replace(/\/+$/, ""));
      }
    } catch (err) {
      console.warn("[config] Unable to persist custom API base URL:", err);
    }
  }
}

/**
 * Returns the current active user ID (UUID) for Supabase operations
 * @returns {string}
 */
export function getUserId() {
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_USER_ID);
      if (stored && stored.trim()) {
        return stored.trim();
      }
    } catch {
      // Storage access disabled
    }
  }
  return DEFAULT_USER_ID;
}

/**
 * Sets a custom user ID in localStorage
 * @param {string|null} userId
 */
export function setUserId(userId) {
  if (typeof localStorage !== "undefined") {
    try {
      if (!userId || !userId.trim()) {
        localStorage.removeItem(STORAGE_KEY_USER_ID);
      } else {
        localStorage.setItem(STORAGE_KEY_USER_ID, userId.trim());
      }
    } catch (err) {
      console.warn("[config] Unable to persist custom user ID:", err);
    }
  }
}

/**
 * Dynamic API endpoint builders reflecting the current API base URL
 */
export const API_ENDPOINTS = {
  health: () => `${getApiBaseUrl()}/api/health`,
  vapidPublicKey: () => `${getApiBaseUrl()}/api/vapid-public-key`,
  subscribe: () => `${getApiBaseUrl()}/api/subscribe`,
  unsubscribe: () => `${getApiBaseUrl()}/api/unsubscribe`,
  sightings: () => `${getApiBaseUrl()}/api/sightings`,
};
