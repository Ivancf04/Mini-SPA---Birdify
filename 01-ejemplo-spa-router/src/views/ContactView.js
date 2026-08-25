// ── IMPORT DINÁMICO ─────────────────────────────────────────────────────
// A diferencia de "import X from './services/apiService.js'" en la parte
// superior del archivo (import estático, se descarga siempre), aquí
// cargamos el módulo SOLO cuando esta vista realmente se visita.
// Esto reduce el JavaScript inicial que descarga el navegador: una
// práctica clave de rendimiento en PWAs.

export default async function ContactView() {
  const { default: ApiService } = await import("../services/apiService.js");
  const api = new ApiService();

  let posts = [];
  let error = null;
  try {
    posts = await api.getPosts();
  } catch (e) {
    error = e.message;
  }

  const listado = error
    ? `<p style="color:#b91c1c">${error}</p>`
    : `<ul>${posts.map((p) => `<li>${p.title}</li>`).join("")}</ul>`;

  return `
    <div class="card">
      <h2>Contacto</h2>
      <p>Este módulo (ApiService) se descargó justo ahora, de forma
      diferida, al entrar a esta vista (revisa la pestaña Network).</p>
      ${listado}
    </div>
  `;
}
