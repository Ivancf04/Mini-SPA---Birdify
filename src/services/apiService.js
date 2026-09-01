// ── SERVICIO DE API REST (iNaturalist) ──────────────────────────────
// URL base de la API REST pública y gratuita de iNaturalist (especies de aves).
// No requiere autenticación ni API Key y devuelve datos en formato JSON.
export const BASE_URL = "https://api.inaturalist.org/v1";

export default class ApiService {
  /**
   * Obtiene una lista de aves desde la API REST de iNaturalist.
   * @param {number} limit - Cantidad de registros a solicitar.
   * @returns {Promise<Array>} Lista de aves formateada para la vista.
   */
  async getBirds(limit = 9) {
    const response = await fetch(
      `${BASE_URL}/taxa?taxon_id=3&rank=species&per_page=${limit}&locale=es`
    );

    if (!response.ok) {
      throw new Error(
        `Error al obtener los datos de la API (${response.status}: ${response.statusText})`
      );
    }

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
   * Obtiene la información detallada de una especie de ave por su ID.
   * @param {string|number} id - ID del taxón del ave.
   * @returns {Promise<Object|null>} Objeto con los datos del ave o null si no se encuentra.
   */
  async getBirdById(id) {
    const response = await fetch(`${BASE_URL}/taxa/${id}?locale=es`);

    if (!response.ok) {
      throw new Error(
        `Error al consultar el detalle del ave (${response.status}: ${response.statusText})`
      );
    }

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
