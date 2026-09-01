export default async function ItemDetailView(params) {
  // Import dinámico del servicio ApiService
  const { default: ApiService } = await import("../services/apiService.js");
  const service = new ApiService();

  let item = null;
  let error = null;

  // Estado de carga (Loading): Es manejado por el Router mediante el skeleton loader
  // Estado de error y éxito: gestionados con try/catch y async/await
  try {
    item = await service.getBirdById(params?.id);
  } catch (err) {
    error = err.message;
  }

  // Estado de Error
  if (error) {
    return `
      <div class="card-detail error-card" role="alert">
        <h2>Error al obtener la información</h2>
        <p>${error}</p>
        <a href="/" data-link class="back-link">← Volver al inicio</a>
      </div>
    `;
  }

  // Elemento no encontrado
  if (!item) {
    return `
      <div class="card-detail">
        <h2>Ave no encontrada</h2>
        <p>No se encontró ninguna especie con el ID "${params?.id ?? ""}".</p>
        <a href="/" data-link class="back-link">← Volver al inicio</a>
      </div>
    `;
  }

  // Estado de Éxito
  const photoHtml = item.photo
    ? `<img src="${item.photo}" alt="${item.title}" class="detail-img" />`
    : "";

  return `
    <div class="card-detail">
      ${photoHtml}
      <h2>${item.title}</h2>
      <p class="scientific-name"><em>${item.scientificName}</em></p>
      <p>${item.description}</p>
      <small>${item.meta}</small>
      ${
        item.wikipediaUrl
          ? `<p><a href="${item.wikipediaUrl}" target="_blank" rel="noopener noreferrer" class="external-link">Ver más detalles en Wikipedia ↗</a></p>`
          : ""
      }
      <a href="/" data-link class="back-link">← Volver al inicio</a>
    </div>
  `;
}
