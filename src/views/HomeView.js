import ItemsService from "../services/itemsService.js";
import ItemCard from "../components/ItemCard.js";

// TODO: si renombraste "item" a algo de tu tema, ajusta también
// el título de esta vista.
export default async function HomeView() {
  const service = new ItemsService();
  const items = await service.getAll();


  return `
    <h2>Aves Registradas</h2>
    <h4>Profe en home view al hacer el "fetch" de todos los items, obviamente se llama el item service, asi que para que no se muestre eso, elimine la creacion dinamica de cartas en esta vista para probar el import dinamico.</h4>
    <div class="grid">
    
      ${items.map((item) => ItemCard(item)).join("")}
      <!-- Este se usa para probar el error de un id inexistente -->
      <article class="card" data-slug="ejemplo">
              <h3>Ejemplo</h3>
              <p>Esto es un texto de ejemplo</p>
              <p><small>Esto es metadata de ejemplo</small></p>
              <a href="/item/5" data-link>Ver detalle →</a>
      </article>
    </div>
  `;
}


