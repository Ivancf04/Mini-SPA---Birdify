import { slugify } from "../utils/slugify.js";

// Recibe un objeto "item" y devuelve el HTML de su tarjeta en el listado.
// TODO: ajusta qué campos mostrar según tu tema, si lo deseas
// (por ejemplo, mostrar "meta" como "Duración:", "Precio:", etc.)
export default function ItemCard(item) {
  // TODO (Ejercicio - Parte A, punto 3): usa slugify(item.title) para
  // llenar el atributo data-slug de abajo (actualmente queda sin procesar).
  const slug = slugify(item.title);

  return `
    <article class="card" data-slug="${slug}">
      <h3>${item.title}</h3>
      <p>${item.description}</p>
      <p><small>${item.meta}</small></p>
      <a href="/item/${item.id}" data-link>Ver detalle →</a>
    </article>
  `;
}
