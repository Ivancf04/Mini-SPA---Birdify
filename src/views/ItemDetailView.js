// TODO (Ejercicio - Parte A, punto 2): completa esta vista.
//
// Esta función recibirá el objeto "params" que tu Router extraiga de la
// URL, por ejemplo params = { id: "2" } para la ruta "/item/2".
//
// Pasos sugeridos:
//   1. Dentro de esta función (NO como import estático arriba del
//      archivo), haz: const { default: ItemsService } = await
//      import("../services/itemsService.js");
//   2. Crea una instancia: const service = new ItemsService();
//   3. Usa service.getById(params.id) para obtener el elemento.
//   4. Si no existe, devuelve un HTML simple indicando "no encontrado".
//   5. Si existe, devuelve un <div class="card"> con sus campos
//      (título, descripción, meta...).
//
// TODO: una vez que funcione, ajusta qué campos mostrar y cómo
// se llaman en pantalla, según tu tema.

export default async function ItemDetailView(params) {
  const { default: ItemsService } = await import("../services/itemsService.js");
  const service = new ItemsService();
  const item = await service.getById(params?.id);

  if (!item) {
    return `
      <div class="card">
        <h2>Elemento no encontrado</h2>
        <p>El elemento con ID "${params?.id ?? ""}" no existe en el catálogo.</p>
        <a href="/" data-link>← Volver al inicio</a>
      </div>
    `;
  }

  return `
    <div class="card">
      <h2>${item.title}</h2>
      <p>${item.description}</p>
      <p><small>${item.meta}</small></p>
      <a href="/" data-link>← Volver al inicio</a>
    </div>
  `;
}
