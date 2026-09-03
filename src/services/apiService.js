// ── SERVICIO DE API REST (iNaturalist) ──────────────────────────────
// URL base de la API REST pública y gratuita de iNaturalist (especies de aves).
// No requiere autenticación ni API Key y devuelve datos en formato JSON.

export const BASE_URL = "https://api.inaturalist.org/v1"; //ruta funcional

//export const BASE_URL = "https://api.inaturalist.org/v1/ruta_inexistente"; inexistente 404
//export const BASE_URL = "https://google.com"; // para que falle y no se comunique


/**
 * Funcion auxiliar para realizar peticiones HTTP con:
 * 1. Timeout obligatorio con AbortController (por defecto 5 segundos).
 * 2. Diferenciacion de errores (AbortError, TypeError / CORS, y ServerError con status).
 * 3. Reintento automatico condicional (solo ante errores de red/timeout, NO para errores de servidor HTTP).
 *
 * @param {string} url - Endpoint a consultar.
 * @param {RequestInit} options - Opciones adicionales de fetch.
 * @param {number} reintentos - Cantidad de reintentos permitidos (minimo 1).
 * @param {number} timeoutMs - Tiempo limite antes de abortar en ms (5000 ms).
 * @returns {Promise<Response>} Respuesta de la peticion fetch.
 */

//export async function fetchWithRetry(url, options = {}, reintentos = 1, timeoutMs = 1) { para el TimeOut
export async function fetchWithRetry(url, options = {}, reintentos = 1, timeoutMs = 5000) {
  let intento = 0;

  while (intento <= reintentos) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      if (intento > 0) {
        console.warn(
          `[Reintento automatico ${intento}/${reintentos}] Reintentando peticion a: ${url}`
        );
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Verificamos si es error HTTP del servidor 
      if (!response.ok) {
        const serverError = new Error(
          `Error de servidor (${response.status}: ${response.statusText || "Respuesta no exitosa"})`
        );
        serverError.name = "ServerError";
        serverError.status = response.status;
        serverError.statusText = response.statusText;

        // No reintentar errores HTTP de servidor (como 404, 500, o el que sea.)
        console.warn(
          `[HTTP ${response.status}] Error de servidor recibido. Criterio: NO se realizan reintentos automaticos para errores de servidor HTTP.`
        );
        throw serverError;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      const isTimeout = err.name === "AbortError";
      const isNetworkOrCors = err instanceof TypeError;
      const isServerError = Boolean(err.status);

      // 1. Si es error HTTP de servidor, detener y no reintentar
      if (isServerError) {
        throw err;
      }

      // 2. Si es error de red/CORS o timeout y aun tenemos reintentos disponibles:
      if ((isNetworkOrCors || isTimeout) && intento < reintentos) {
        intento++;
        const causa = isTimeout
          ? `Timeout (el servidor no respondio en ${timeoutMs / 1000}s)`
          : `Error de red o restriccion CORS (TypeError: ${err.message})`;

        console.warn(
          `[Fallo detectado] ${causa}. Ejecutando reintento automatico (${intento}/${reintentos})...`
        );

        // espera 1 segundo antes del reintento
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // 3. Si se agotaron los reintentos o el error persiste, lanzamos el error correspondiente
      console.error(
        `[Peticion Fallida] Se agotaron los reintentos (${reintentos}) para: ${url}. Error final:`,
        err
      );
      throw err;
    }
  }
}

export default class ApiService {
  /**
   * Obtiene una lista de aves desde la API REST de iNaturalist.
   * @param {number} limit - Cantidad de registros a solicitar.
   * @returns {Promise<Array>} Lista de aves formateada para la vista.
   */
  async getBirds(limit = 9) {
    const url = `${BASE_URL}/taxa?taxon_id=3&rank=species&per_page=${limit}&locale=es`;
    const response = await fetchWithRetry(url);
    const data = await response.json();

    // Mapeamos los datos recibidos de la API a un formato limpio para el componente
    return data.results.map((bird) => ({
      id: bird.id.toString(),
      title: bird.preferred_common_name || bird.name,
      scientificName: bird.name,
      description: bird.wikipedia_summary
        ? bird.wikipedia_summary.replace(/<[^>]*>?/gm, "").trim()
        : "Especie de ave registrada en la plataforma de biodiversidad iNaturalist.",
      meta: `Nombre científico: ${bird.name} | Observaciones: ${bird.observations_count?.toLocaleString("es-MX") || 0}`,
      photo:
        bird.default_photo?.medium_url ||
        "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=400",
    }));
  }

  /**
   * Obtiene la informacion detallada de una especie de ave por su ID.
   * @param {string|number} id - ID del taxón del ave.
   * @returns {Promise<Object|null>} Objeto con los datos del ave o null si no se encuentra.
   */
  async getBirdById(id) {
    const url = `${BASE_URL}/taxa/${id}?locale=es`;
    const response = await fetchWithRetry(url);
    const data = await response.json();
    const bird = data.results?.[0];

    if (!bird) return null;

    return {
      id: bird.id.toString(),
      title: bird.preferred_common_name || bird.name,
      scientificName: bird.name,
      description: bird.wikipedia_summary
        ? bird.wikipedia_summary.replace(/<[^>]*>?/gm, "").trim()
        : "Especie de ave registrada en la plataforma de biodiversidad iNaturalist.",
      meta: `Nombre científico: ${bird.name} | Observaciones registradas: ${bird.observations_count?.toLocaleString("es-MX") || 0}`,
      photo: bird.default_photo?.medium_url || null,
      wikipediaUrl: bird.wikipedia_url || null,
    };
  }
}
