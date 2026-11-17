import fs from "fs";
import { BASE_PATH, SW_PATH, SW_SCOPE, getApiBaseUrl, getUserId, API_ENDPOINTS } from "../src/config.js";
import { urlBase64ToUint8Array, isPushManagerSupported } from "../src/pwa/pushNotifications.js";
import { BASE_PATH as REG_BASE, SW_PATH as REG_SW, SW_SCOPE as REG_SCOPE } from "../src/pwa/registerSW.js";

console.log("=== VERIFYING MILESTONE 2: FRONTEND CONFIG & PUSH ===");

// 1. Config tests
console.log("[1/5] Centralized Config verification:");
console.log(" - BASE_PATH:", BASE_PATH);
console.log(" - SW_PATH:", SW_PATH);
console.log(" - SW_SCOPE:", SW_SCOPE);
console.log(" - Default User ID:", getUserId());
console.log(" - API Base URL:", getApiBaseUrl());

if (getUserId() !== "0f99790f-05a5-4049-8605-3180bbe889cb") {
  throw new Error("Default user ID does not match expected UUID!");
}
if (API_ENDPOINTS.vapidPublicKey() !== "http://localhost:3000/api/vapid-public-key") {
  throw new Error("API_ENDPOINTS.vapidPublicKey() did not produce expected URL!");
}
if (API_ENDPOINTS.subscribe() !== "http://localhost:3000/api/subscribe") {
  throw new Error("API_ENDPOINTS.subscribe() did not produce expected URL!");
}
if (API_ENDPOINTS.unsubscribe() !== "http://localhost:3000/api/unsubscribe") {
  throw new Error("API_ENDPOINTS.unsubscribe() did not produce expected URL!");
}
if (API_ENDPOINTS.sightings() !== "http://localhost:3000/api/sightings") {
  throw new Error("API_ENDPOINTS.sightings() did not produce expected URL!");
}
console.log(" -> Config assertions PASSED");

// 2. RegisterSW re-exports
console.log("[2/5] registerSW.js re-exports verification:");
if (REG_BASE !== BASE_PATH || REG_SW !== SW_PATH || REG_SCOPE !== SW_SCOPE) {
  throw new Error("registerSW.js re-exports do not match src/config.js!");
}
console.log(" -> registerSW re-exports PASSED");

// 3. Push Manager VAPID conversion
console.log("[3/5] PushManager utilities verification:");
global.window = {
  atob: (str) => Buffer.from(str, "base64").toString("binary"),
};
const sampleVapidKey = "BExamplePublicKey0000000000000000000000000000000000000000000000000000000000000000000000";
const convertedKey = urlBase64ToUint8Array(sampleVapidKey);
console.log(" - Converted VAPID key byte length:", convertedKey.length);
if (convertedKey.length !== 65) {
  throw new Error(`Expected 65 bytes for NIST P-256 public key, got ${convertedKey.length}`);
}
console.log(" -> VAPID key conversion PASSED");

// 4. sw.js inspection
console.log("[4/5] sw.js API bypass & push listener inspection:");
const swCode = fs.readFileSync("./sw.js", "utf8");

if (!swCode.includes('url.pathname.includes("/api/")')) {
  throw new Error("sw.js does not exclude /api/ in chooseStrategy!");
}
console.log(" - /api/ bypass in chooseStrategy: CONFIRMED");

if (!swCode.includes('self.addEventListener("push"')) {
  throw new Error("sw.js is missing 'push' event listener!");
}
console.log(" - push event listener in sw.js: CONFIRMED");

if (!swCode.includes("SCOPE_PATH") || !swCode.includes("showNotification")) {
  throw new Error("sw.js push handler missing SCOPE_PATH normalization or showNotification!");
}
console.log(" - SCOPE_PATH asset resolution & showNotification: CONFIRMED");

// 5. Views and Main.js inspection
console.log("[5/5] UI files inspection:");
const sightingsCode = fs.readFileSync("./src/views/SightingsView.js", "utf8");
if (!sightingsCode.includes("btn-toggle-push") || !sightingsCode.includes("push-feedback-alert")) {
  throw new Error("SightingsView.js is missing push notification UI controls!");
}
console.log(" - SightingsView push UI controls: CONFIRMED");

const diagCode = fs.readFileSync("./src/views/DiagnosticView.js", "utf8");
if (!diagCode.includes("Web Push Notifications & VAPID") || !diagCode.includes("btn-diag-subscribe-push")) {
  throw new Error("DiagnosticView.js is missing Web Push diagnostic panel!");
}
console.log(" - DiagnosticView Web Push diagnostic card: CONFIRMED");

const mainCode = fs.readFileSync("./src/main.js", "utf8");
if (!mainCode.includes("syncPushSubscriptionOnStartup") || !mainCode.includes("btn-toggle-push")) {
  throw new Error("main.js is missing push startup resync or push click handlers!");
}
console.log(" - main.js push integration & startup resync: CONFIRMED");

console.log("\nALL MILESTONE 2 CHECKS PASSED SUCCESSFULLY!");
