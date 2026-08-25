import { formatDate, capitalize } from "../utils/index.js";

export default function AboutView() {
  const hoy = formatDate(new Date());
  return `
    <div class="card">
      <h2>${capitalize("acerca de este proyecto")}</h2>
      <p>Proyecto de demostración para la clase de Aplicaciones Web
      Progresivas: organización profesional del código y enrutamiento
      del lado del cliente.</p>
      <p>Vista renderizada el: ${hoy}</p>
    </div>
  `;
}
