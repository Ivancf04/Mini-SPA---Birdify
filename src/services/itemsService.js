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
    title: "Colibrí Garganta Rubí",
    description: "Pequeño y vibrante colibrí conocido por su característico plumaje rojo brillante en la garganta de los machos. Es muy activo y puede aletear hasta 80 veces por segundo.",
    meta: "Hábitat: Bosques caducifolios y jardines | Alimentación: Néctar",
  },
  {
    id: "2",
    title: "Águila Calva",
    description: "Majestuosa ave de presa con cabeza blanca distintiva y gran envergadura. Símbolo nacional de varios países y depredador tope en ambientes acuáticos.",
    meta: "Hábitat: Zonas cercanas a lagos y ríos | Alimentación: Peces",
  },
  {
    id: "3",
    title: "Quetzal Resplandeciente",
    description: "Ave mística de plumaje verde esmeralda brillante y pecho rojo intenso. Considerada sagrada por las antiguas civilizaciones mayas y aztecas.",
    meta: "Hábitat: Bosques nubosos | Alimentación: Aguacates y frutos",
  },
  {
    id: "4",
    title: "Cardenal Rojo",
    description: "Llamativa ave cantora de color rojo escarlata brillante en los machos, con una cresta distintiva en la cabeza y una máscara facial negra.",
    meta: "Hábitat: Bosques templados y jardines | Alimentación: Semillas",
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
