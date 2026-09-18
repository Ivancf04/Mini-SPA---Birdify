import { openDB } from "https://cdn.jsdelivr.net/npm/idb@8/+esm";

const DB_NAME = "BirdifyDB";
const DB_VERSION = 1;
const STORE_NAME = "sightings";

/**
 * Inicializa y retorna la instancia de la base de datos IndexedDB.
 * En el callback upgrade se define el Object Store y el índice 'by_category'.
 */
export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });

        // Índice sobre el campo 'category'
        store.createIndex("by_category", "category", { unique: false });
      }
    },
  });
}

/**
 * 1. Crear un registro (db.put)
 */
export async function saveSighting(sighting) {
  const db = await getDB();
  // db.put inserta un nuevo registro o actualiza si ya tiene id
  return await db.put(STORE_NAME, sighting);
}

/**
 * 2. Leer todos los registros (db.getAll)
 */
export async function getAllSightings() {
  const db = await getDB();
  return await db.getAll(STORE_NAME);
}

/**
 * 3. Leer registros filtrados mediante el índice (db.getAllFromIndex)
 */
export async function getSightingsByCategory(category) {
  const db = await getDB();
  return await db.getAllFromIndex(STORE_NAME, "by_category", category);
}

/**
 * 4. Eliminar un registro por su ID (db.delete)
 */
export async function deleteSighting(id) {
  const db = await getDB();
  return await db.delete(STORE_NAME, id);
}
