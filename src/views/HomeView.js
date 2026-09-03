import ApiService from "../services/apiService.js";
import ItemCard from "../components/ItemCard.js";

export default async function HomeView() {
  const service = new ApiService();
  let items = [];
  let errorDetails = null;

  // Estado de carga (Loading): Es manejado automáticamente por el Router
  // mediante el skeleton loader en #app mientras se resuelve la función HomeView.

  // try catch para el exito o error
  try {
    items = await service.getBirds(9);
  } catch (err) {
    // checa que tipo de error paso
    if (err.name === "AbortError") {
      // si fue timeout por abortcontroller
      errorDetails = {
        badge: "Timeout — Tiempo Excedido",
        badgeClass: "error-badge--timeout",
        title: "El servidor tardo demasiado en responder",
        message: "La peticion fue cancelada por superar el tiempo limite (5 segundos).",
        suggestion: "El servicio puede estar lento o tu conexion inestable.",
      };
    } else if (err instanceof TypeError) {
      // si fue error de conexion o cors
      errorDetails = {
        badge: "Error de Red / CORS",
        badgeClass: "error-badge--network",
        title: "Fallo de conexion o bloqueo CORS",
        message: "No fue posible comunicarse con la API de inaturalist.",
        suggestion: "Verifica si estas sin conexion (Offline) o si el navegador bloqueo la peticion por CORS.",
      };
    } else if (err.status) {
      // si el servidor respondio con 404, 500, etc.
      errorDetails = {
        badge: `Error del Servidor (HTTP ${err.status})`,
        badgeClass: "error-badge--server",
        title: `El servidor respondio con codigo ${err.status}`,
        message: err.message,
        suggestion: "El recurso solicitado no esta disponible o el servidor tiene problemas.",
      };
    } else {
      // cualquier otro error
      errorDetails = {
        badge: "Error inesperado",
        badgeClass: "error-badge--network",
        title: "Ocurrio un error inesperado",
        message: err.message || "Error al cargar las aves.",
        suggestion: "Intenta de nuevo.",
      };
    }
  }

  // si fallo muestra la tarjeta de error
  if (errorDetails) {
    return `
      <section class="view-home">
        <h2>Aves Registradas</h2>
        <div class="error-card" role="alert">
          <span class="error-badge ${errorDetails.badgeClass}">${errorDetails.badge}</span>
          <h3>${errorDetails.title}</h3>
          <p>${errorDetails.message}</p>
          <p class="error-suggestion"><small>${errorDetails.suggestion}</small></p>
          <div class="error-actions">
            <a href="/" data-link class="btn-retry">↺ Reintentar conexion</a>
          </div>
        </div>
      </section>
    `;
  }

  // si todo salio bien genera las tarjetas
  return `
    <section class="view-home">
      <h2>Aves Registradas (API iNaturalist)</h2>
      <p class="subtitle">Catalogo generado en tiempo real mediante consumo de API REST</p>
      <div class="grid">
        ${items.map((item) => ItemCard(item)).join("")}
      </div>
    </section>
  `;
}
