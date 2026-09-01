import ApiService from "../services/apiService.js";
import ItemCard from "../components/ItemCard.js";

export default async function HomeView() {
  const service = new ApiService();
  let items = [];
  let error = null;

  // Estado de carga (Loading): Es manejado automáticamente por el Router
  // mediante el skeleton loader en #app mientras se resuelve la función HomeView.

  // Estado de éxito / error: Se gestiona mediante async/await y bloque try/catch
  try {
    items = await service.getBirds(9);
  } catch (err) {
    error = err.message;
  }

  // Estado de Error en el DOM
  if (error) {
    return `
      <section class="view-home">
        <h2>Aves Registradas</h2>
        <div class="error-card" role="alert">
          <h3>Ocurrió un error al cargar las aves</h3>
          <p>${error}</p>
          <p><small>Por favor verifica tu conexión a internet o intenta nuevamente.</small></p>
        </div>
      </section>
    `;
  }

  // Estado de Éxito en el DOM: Generación dinámica con .map()
  return `
    <section class="view-home">
      <h2>Aves Registradas (API iNaturalist)</h2>
      <p class="subtitle">Catálogo generado en tiempo real mediante consumo de API REST</p>
      <div class="grid">
        ${items.map((item) => ItemCard(item)).join("")}
      </div>
    </section>
  `;
}
