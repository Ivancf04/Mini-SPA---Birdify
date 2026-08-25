import ItemsService from "../services/itemsService.js";
import ItemCard from "../components/ItemCard.js";

// TODO: si renombraste "item" a algo de tu tema, ajusta también
// el título de esta vista.
export default async function HomeView() {
  const service = new ItemsService();
  const items = await service.getAll();

  return `
    <h2>Aves Registradas</h2>
    <div class="grid">
      ${items.map((item) => ItemCard(item)).join("")}
      <article class="card" data-slug="ejemplo">
        <h3>Ejemplo</h3>
        <p>Esto es un texto de ejemplo</p>
        <p><small>Esto es metadata de ejemplo</small></p>
        <a href="/item/" data-link>Ver detalle →</a>
      </article>
    </div>
  `;
}

//Este se usa para probar el error de un id inexistente
// <article class="card" data-slug="ejemplo">
      //   <h3>Ejemplo</h3>
      //   <p>Esto es un texto de ejemplo</p>
      //   <p><small>Esto es metadata de ejemplo</small></p>
      //   <a href="/item/5" data-link>Ver detalle →</a>
// </article>
