// Versión fijada (8.0.4): debe coincidir con IDB_MODULE_URL en sw.js, que la precachea.
import { openDB } from "https://cdn.jsdelivr.net/npm/idb@8.0.4/+esm";

export const DB_NAME = "BirdifyDB";
export const DB_VERSION = 2; // Migración: versión 2 incorpora store 'outbox'
export const STORE_NAME = "sightings";
export const OUTBOX_STORE_NAME = "outbox";

let dbInstance = null;

/**
 * Inicializa y retorna la instancia de la base de datos IndexedDB.
 * Migración controlada:
 * - Versión 1: store 'sightings' con índice 'by_category'.
 * - Versión 2: store 'outbox' con índices 'by_status' y 'by_createdAt'.
 * Maneja eventos 'blocked' y 'blocking' para advertir o cerrar conexiones antiguas.
 */
export async function getDB() {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[IndexedDB] upgrade ejecutado: v${oldVersion} -> v${newVersion}`);

      // Conservar / crear store sightings
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by_category", "category", { unique: false });
        console.log(`[IndexedDB] Store '${STORE_NAME}' e índice 'by_category' creados.`);
      }

      // Versión 2: crear outbox para la cola de sincronización offline
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const outboxStore = db.createObjectStore(OUTBOX_STORE_NAME, {
          keyPath: "clientRequestId",
        });
        outboxStore.createIndex("by_status", "status", { unique: false });
        outboxStore.createIndex("by_createdAt", "createdAt", { unique: false });
        console.log(`[IndexedDB] Store '${OUTBOX_STORE_NAME}' e índices creados.`);
      }
    },
    blocked(currentVersion, blockedVersion, event) {
      console.warn(
        `[IndexedDB] Actualización a v${blockedVersion} bloqueada por conexión activa en otra pestaña (v${currentVersion}).`
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("birdify-db-blocked", {
            detail: { currentVersion, blockedVersion },
          })
        );
      }
    },
    blocking(currentVersion, blockedVersion, event) {
      console.warn(
        `[IndexedDB] Esta conexión está bloqueando una actualización en otra pestaña. Cerrando conexión...`
      );
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("birdify-db-blocking", {
            detail: { currentVersion, blockedVersion },
          })
        );
      }
    },
    terminated() {
      console.warn("[IndexedDB] La conexión de la base de datos fue terminada inesperadamente.");
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Genera un identificador único estable para la operación del cliente.
 */
export function generateClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 1. Guardar primero: Guarda localmente el avistamiento y encola la operación en outbox
 * en una SOLA transacción atómica de IndexedDB.
 */
export async function saveSightingWithOutbox(sightingData) {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
  const sightingsStore = tx.objectStore(STORE_NAME);
  const outboxStore = tx.objectStore(OUTBOX_STORE_NAME);

  const clientRequestId = sightingData.clientRequestId || generateClientRequestId();
  const createdAt = sightingData.createdAt || new Date().toISOString();

  // Registro del avistamiento local (diferenciando guardado local de confirmado por servidor)
  const localRecord = {
    ...sightingData,
    clientRequestId,
    createdAt,
    syncStatus: "pending", // 'pending' | 'syncing' | 'synced' | 'failed'
    serverConfirmed: false,
    syncError: null,
  };

  // Se almacena en sightings. put devuelve la key asignada (id)
  const sightingId = await sightingsStore.put(localRecord);
  localRecord.id = sightingId;

  // Se almacena en outbox la operación con el payload de negocio y metadatos de cola
  const outboxEntry = {
    clientRequestId,
    sightingId,
    payload: {
      clientRequestId,
      birdName: localRecord.birdName,
      location: localRecord.location,
      category: localRecord.category,
      date: localRecord.date,
      notes: localRecord.notes || "",
      createdAt,
    },
    createdAt,
    attempts: 0,
    lastError: null,
    status: "pending", // 'pending' | 'syncing' | 'failed'
  };

  await outboxStore.put(outboxEntry);
  await tx.done;

  return { sightingId, clientRequestId, sighting: localRecord };
}

/**
 * 2. Operaciones sobre la cola outbox
 */
export async function getAllOutbox() {
  const db = await getDB();
  return await db.getAll(OUTBOX_STORE_NAME);
}

export async function getOutboxCount() {
  const db = await getDB();
  return await db.count(OUTBOX_STORE_NAME);
}

export async function getOutboxItem(clientRequestId) {
  const db = await getDB();
  return await db.get(OUTBOX_STORE_NAME, clientRequestId);
}

export async function deleteFromOutbox(clientRequestId) {
  const db = await getDB();
  return await db.delete(OUTBOX_STORE_NAME, clientRequestId);
}

/**
 * Marca el avistamiento como sincronizado y confirmado tras respuesta exitosa del servidor,
 * y retira la operación de outbox conservando el registro en sightings.
 */
export async function markSightingAsSynced(clientRequestId, serverResponse = {}) {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
  const sightingsStore = tx.objectStore(STORE_NAME);
  const outboxStore = tx.objectStore(OUTBOX_STORE_NAME);

  // Retirar de outbox
  await outboxStore.delete(clientRequestId);

  // Localizar el registro en sightings y actualizarlo
  const allSightings = await sightingsStore.getAll();
  const target = allSightings.find((s) => s.clientRequestId === clientRequestId);

  if (target) {
    target.syncStatus = "synced";
    target.serverConfirmed = true;
    target.syncError = null;
    target.syncedAt = new Date().toISOString();
    if (serverResponse?.sighting?.serverId) {
      target.serverId = serverResponse.sighting.serverId;
    }
    await sightingsStore.put(target);
  }

  await tx.done;
  return target;
}

/**
 * Actualiza el estado a 'failed' y registra el último error en outbox y en sightings.
 */
export async function updateOutboxAttempt(clientRequestId, errorMessage) {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
  const sightingsStore = tx.objectStore(STORE_NAME);
  const outboxStore = tx.objectStore(OUTBOX_STORE_NAME);

  const outboxItem = await outboxStore.get(clientRequestId);
  if (outboxItem) {
    outboxItem.attempts = (outboxItem.attempts || 0) + 1;
    outboxItem.lastError = errorMessage;
    outboxItem.status = "failed";
    outboxItem.lastAttemptAt = new Date().toISOString();
    await outboxStore.put(outboxItem);
  }

  const allSightings = await sightingsStore.getAll();
  const target = allSightings.find((s) => s.clientRequestId === clientRequestId);
  if (target) {
    target.syncStatus = "failed";
    target.syncError = errorMessage;
    await sightingsStore.put(target);
  }

  await tx.done;
}

/**
 * Marca el estado como 'syncing' mientras está en tránsito.
 */
export async function markSightingAsSyncing(clientRequestId) {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
  const sightingsStore = tx.objectStore(STORE_NAME);
  const outboxStore = tx.objectStore(OUTBOX_STORE_NAME);

  const outboxItem = await outboxStore.get(clientRequestId);
  if (outboxItem) {
    outboxItem.status = "syncing";
    await outboxStore.put(outboxItem);
  }

  const allSightings = await sightingsStore.getAll();
  const target = allSightings.find((s) => s.clientRequestId === clientRequestId);
  if (target) {
    target.syncStatus = "syncing";
    await sightingsStore.put(target);
  }

  await tx.done;
}

/**
 * Métodos existentes preservados para retrocompatibilidad
 */
export async function saveSighting(sighting) {
  const db = await getDB();
  return await db.put(STORE_NAME, sighting);
}

export async function getAllSightings() {
  const db = await getDB();
  return await db.getAll(STORE_NAME);
}

export async function getSightingsByCategory(category) {
  const db = await getDB();
  return await db.getAllFromIndex(STORE_NAME, "by_category", category);
}

export async function deleteSighting(id) {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, OUTBOX_STORE_NAME], "readwrite");
  const sightingsStore = tx.objectStore(STORE_NAME);
  const outboxStore = tx.objectStore(OUTBOX_STORE_NAME);

  const sighting = await sightingsStore.get(id);
  if (sighting && sighting.clientRequestId) {
    await outboxStore.delete(sighting.clientRequestId);
  }
  await sightingsStore.delete(id);
  await tx.done;
  return true;
}
