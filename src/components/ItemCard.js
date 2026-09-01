import { slugify } from "../utils/slugify.js";

// Recibe un objeto "item" y devuelve el HTML de su tarjeta en el listado.
export default function ItemCard(item) {
  const slug = slugify(item.title);
  const photoHtml = item.photo
    ? `<img src="${item.photo}" alt="${item.title}" class="card-img" loading="lazy" />`
    : "";

  return `
    <article class="card" data-slug="${slug}">
      ${photoHtml}
      <div class="card-body">
        <h3>${item.title}</h3>
        <p>${item.description.length > 110 ? item.description.slice(0, 110) + "…" : item.description}</p>
        <p><small>${item.meta}</small></p>
        <a href="/item/${item.id}" data-link>Ver detalle →</a>
      </div>
    </article>
  `;
}
