import { getConsejos } from "../services/contentService.js";

// "Nosotros" + consejos de observación (data/consejos.json → Stale-While-Revalidate en sw.js)
export default async function AboutView() {
  let consejosHtml = "";
  try {
    const { data, fuente } = await getConsejos();
    const esCache = fuente.toLowerCase().includes("cache");
    consejosHtml = `
      <div class="card content-panel">
        <h3>Consejos para observar aves · versión ${data.version}</h3>
        <p><span class="content-source ${esCache ? "content-source--cache" : ""}">Fuente: ${fuente}</span></p>
        <ul>
          ${data.consejos.map((c) => `<li><strong>${c.titulo}.</strong> ${c.texto}</li>`).join("")}
        </ul>
      </div>
    `;
  } catch (error) {
    console.warn("[AboutView] No se pudieron cargar los consejos:", error);
    consejosHtml = `
      <div class="card content-panel">
        <h3>Consejos para observar aves</h3>
        <p>Los consejos no están disponibles sin conexión todavía.</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <h2>Acerca de Birdify</h2>
      <p>Birdify es una aplicación modular para el registro y consulta de avistamiento de aves, implementada como una Single Page Application (SPA) para ofrecer una navegación fluida.</p>
    </div>
    ${consejosHtml}
  `;
}