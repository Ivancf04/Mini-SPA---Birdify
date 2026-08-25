// Servicio "mock": simula una fuente de datos (podría ser un fetch real
// a una API). Exportación por defecto a propósito: la importarás de
// forma DINÁMICA en ItemDetailView.js.
//
// ── TODO ─────────────────────────────────────────────
// Reemplaza el arreglo ITEMS por los datos de tu propio tema (mínimo 4
// elementos, mínimo 3 campos cada uno). Puedes renombrar "ItemsService"
// y "Item" si quieres (ej. RecetasService / Receta), pero no es
// obligatorio: lo que se califica son los datos y los campos, no el
// nombre de la clase.
//
// Ejemplo si tu tema fuera "recetas":
//   { id: "1", title: "Tacos al pastor", description: "...", meta: "30 min" }

const ITEMS = [
  {
    id: "1",
    title: "Elemento de ejemplo uno",
    description: "Descripción corta del primer elemento de tu catálogo.",
    meta: "Dato extra (ej. duración, precio, categoría...)",
  },
  {
    id: "2",
    title: "Elemento de ejemplo dos",
    description: "Descripción corta del segundo elemento de tu catálogo.",
    meta: "Dato extra",
  },
  {
    id: "3",
    title: "Elemento de ejemplo tres",
    description: "Descripción corta del tercer elemento de tu catálogo.",
    meta: "Dato extra",
  },
  {
    id: "4",
    title: "Elemento de ejemplo cuatro",
    description: "Descripción corta del cuarto elemento de tu catálogo.",
    meta: "Dato extra",
  },
];

export default class ItemsService {
  async getAll() {
    return ITEMS;
  }

  async getById(id) {
    return ITEMS.find((item) => item.id === id) ?? null;
  }
}
