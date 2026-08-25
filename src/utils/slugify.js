// TODO (Ejercicio - Parte A, punto 3): completa esta función.
//
// Debe recibir un texto (Por ejemplo "Tacos al Pastor") y devolver un slug en
// minúsculas, sin acentos y con guiones en vez de espacios
// (ej. "tacos-al-pastor").

//
// Pistas:
//  - text.normalize("NFD") + una expresión regular puede quitarte los
//    acentos (busca "eliminar diacríticos JavaScript").
//  - .toLowerCase(), .trim() y .replace(/\s+/g, "-") te ayudan con el resto.
//
// Recuerda: debe ser una EXPORTACIÓN NOMBRADA (no "export default"),
// porque en components/ItemCard.js se importa así:
//   import { slugify } from "../utils/slugify.js";

export function slugify(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}
//Esto esta funcionando bien.