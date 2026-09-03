export default async function ItemDetailView(params) {
  // import dinamico del servicio
  const { default: ApiService } = await import("../services/apiService.js");
  const service = new ApiService();

  let item = null;
  let errorDetails = null;

  try {
    item = await service.getBirdById(params?.id);
  } catch (err) {
    if (err.name === "AbortError") {
      // si fue timeout
      errorDetails = {
        badge: "Timeout — Tiempo Excedido",
        badgeClass: "error-badge--timeout",
        title: "Tiempo de espera agotado",
        message: "El servidor tardo mas de 5 segundos en responder con los detalles.",
      };
    } else if (err instanceof TypeError) {
      // si fue error de conexion o cors
      errorDetails = {
        badge: "Error de Red / CORS",
        badgeClass: "error-badge--network",
        title: "Error de conexion o CORS",
        message: "No fue posible conectar con la api para obtener el detalle.",
      };
    } else if (err.status) {
      // si el servidor mando error
      errorDetails = {
        badge: `Error HTTP ${err.status}`,
        badgeClass: "error-badge--server",
        title: `El servidor devolvio un error (${err.status})`,
        message: err.message,
      };
    } else {
      errorDetails = {
        badge: "Error inesperado",
        badgeClass: "error-badge--network",
        title: "Error al cargar la informacion",
        message: err.message || "No se pudo recuperar el ave.",
      };
    }
  }

  // si fallo muestra el error
  if (errorDetails) {
    return `
      <div class="card-detail error-card" role="alert">
        <span class="error-badge ${errorDetails.badgeClass}">${errorDetails.badge}</span>
        <h2>${errorDetails.title}</h2>
        <p>${errorDetails.message}</p>
        <div class="error-actions">
          <a href="/" data-link class="btn-retry">↺ Reintentar</a>
          <a href="/" data-link class="back-link">← Volver al inicio</a>
        </div>
      </div>
    `;
  }

  // si no encontro el ave
  if (!item) {
    return `
      <div class="card-detail">
        <h2>Ave no encontrada</h2>
        <p>No se encontro ninguna especie con el ID "${params?.id ?? ""}".</p>
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
