import ItemsService from "../services/itemsService.js";
import ItemCard from "../components/ItemCard.js";

// TODO: si renombraste "item" a algo de tu tema, ajusta también
// el título de esta vista.
export default async function HomeView() {
  const service = new ItemsService();
  const items = await service.getAll();

  return `
    <h2>Elementos disponibles</h2>
    <div class="grid">
      ${items.map((item) => ItemCard(item)).join("")}
    </div>
  `;
}
