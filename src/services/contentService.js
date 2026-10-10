// ── SERVICIO DE CONTENIDO PROPIO (archivos JSON en /data) ─────────────
// Las rutas se resuelven con import.meta.url para que funcionen igual en
// localhost (raíz "/") y en GitHub Pages ("/Mini-SPA---Birdify/").
//
// La estrategia de caché NO se decide aquí, sino en sw.js:
//   - data/boletin.json  -> Network First
//   - data/consejos.json -> Stale-While-Revalidate
// El SW agrega la cabecera "X-Birdify-Fuente" para saber de dónde salió el dato.

const BOLETIN_URL = new URL("../../data/boletin.json", import.meta.url).href;
const CONSEJOS_URL = new URL("../../data/consejos.json", import.meta.url).href;

async function getJson(url, etiqueta) {
  const response = await fetch(url);
  const fuente = response.headers.get("X-Birdify-Fuente") || "red (sin Service Worker)";

  if (!response.ok) {
    const error = new Error(`${etiqueta}: respuesta ${response.status}`);
    error.status = response.status;
    error.fuente = fuente;
    throw error;
  }

  const data = await response.json();
  return { data, fuente };
}

export async function getBoletin() {
  const result = await getJson(BOLETIN_URL, "Boletín");
  console.log(
    `[Boletín] Edición ${result.data.edicion} (actualizado ${result.data.actualizado}) — fuente: ${result.fuente}`
  );
  return result;
}

export async function getConsejos() {
  const result = await getJson(CONSEJOS_URL, "Consejos");
  console.log(
    `[Consejos] Versión ${result.data.version} con ${result.data.consejos.length} consejos — fuente: ${result.fuente}`
  );
  return result;
}
