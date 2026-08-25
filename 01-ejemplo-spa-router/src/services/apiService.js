// ── EXPORTACIÓN POR DEFECTO ─────────────────────────────────────────────
// Solo puede haber UNA exportación "default" por archivo. Al importarla,
// quien la usa le puede poner el alias que quiera (no tiene que llamarse
// "ApiService" en el archivo que la importa).

export const BASE_URL = "https://jsonplaceholder.typicode.com";

export default class ApiService {
  async getPosts() {
    const response = await fetch(`${BASE_URL}/posts?_limit=5`);
    if (!response.ok) throw new Error("No se pudo obtener la información");
    return response.json();
  }
}
