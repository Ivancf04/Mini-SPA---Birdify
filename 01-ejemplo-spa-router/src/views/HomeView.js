import { APP_VERSION } from "../utils/index.js";

// Cada vista exporta por defecto una función que devuelve el HTML de esa
// "página". El router se encarga de inyectarlo en el contenedor #app.
export default function HomeView() {
  return `
    <div class="card">
      <h2>Inicio</h2>
      <p>Esta es una simulación de SPA construida con módulos ES6 puros
      y la History API del navegador (sin frameworks).</p>
      <p><small>Versión de la app: ${APP_VERSION}</small></p>
    </div>
  `;
}
