import { slugify } from "../utils/slugify.js";

const PHOTO_URL = /^(.*\/)(square|small|medium|large|original)(\.\w+)(\?.*)?$/i;

const PRIORITY_CARDS = 2;

function photoAttributes(url, index) {
  const isPriority = typeof index === "number" && index < PRIORITY_CARDS;
  const loadingAttrs = isPriority ? 'fetchpriority="high"' : 'loading="lazy"';

  const match = url.match(PHOTO_URL);
  if (!match) return `${loadingAttrs} decoding="async"`; // otro formato de URL: sin srcset

  const [, base, , ext, query = ""] = match;
  const small = `${base}small${ext}${query}`;
  const medium = `${base}medium${ext}${query}`;
  return (
    `srcset="${small} 240w, ${medium} 500w" ` +
    `sizes="(max-width: 37.5rem) 90vw, 300px" ` +
    `${loadingAttrs} decoding="async"`
  );
}

export default function ItemCard(item, index) {
  const slug = slugify(item.title);
  const photoHtml = item.photo
    ? `<img src="${item.photo}" ${photoAttributes(item.photo, index)} alt="${item.title}" class="card-img" />`
    : "";

  return `
    <article class="card" data-slug="${slug}" data-title="${item.title.toLowerCase()}">
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