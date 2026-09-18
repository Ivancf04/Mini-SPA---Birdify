import { getAllSightings } from "../services/dbService.js";

export default async function SightingsView() {
  let sightings = [];
  try {
    sightings = await getAllSightings();
  } catch (error) {
    console.error("Error al cargar avistamientos desde IndexedDB:", error);
  }

  return `
    <section class="view-sightings">
      <div class="sightings-header">
        <h2>Bitácora de Avistamientos</h2>
        <p class="subtitle">Registra tus observaciones de aves con persistencia local en IndexedDB.</p>
      </div>

      <!-- Zona de mensajes de feedback al usuario (Error / Éxito) -->
      <div id="db-feedback" class="feedback-banner" style="display: none;" role="alert"></div>

      <div class="sightings-layout">
        <!-- Formulario para agregar registros -->
        <div class="card sightings-form-card">
          <h3>Nuevo Avistamiento</h3>
          <form id="sighting-form">
            <div class="form-group">
              <label for="bird-name">Nombre del Ave *</label>
              <input type="text" id="bird-name" name="birdName" placeholder="Ej. Colibrí Corona Violeta" required />
            </div>

            <div class="form-group">
              <label for="bird-location">Lugar / Ubicación *</label>
              <input type="text" id="bird-location" name="location" placeholder="Ej. Parque Metropolitano" required />
            </div>

            <div class="form-group">
              <label for="bird-category">Categoría de Hábitat (Índice) *</label>
              <select id="bird-category" name="category" required>
                <option value="">Selecciona un hábitat...</option>
                <option value="Bosque">Bosque</option>
                <option value="Urbano">Urbano</option>
                <option value="Humedal">Humedal</option>
                <option value="Costa">Costa</option>
                <option value="Montaña">Montaña</option>
              </select>
            </div>

            <div class="form-group">
              <label for="bird-date">Fecha de Observación *</label>
              <input type="date" id="bird-date" name="date" value="${new Date().toISOString().split("T")[0]}" required />
            </div>

            <div class="form-group">
              <label for="bird-notes">Notas / Observaciones</label>
              <textarea id="bird-notes" name="notes" rows="3" placeholder="Comportamiento, plumaje, hora..."></textarea>
            </div>

            <button type="submit" class="btn-save">💾 Guardar Avistamiento</button>
          </form>
        </div>

        <!-- Listado y Filtro por Índice -->
        <div class="sightings-list-container">
          <div class="list-controls card">
            <label for="filter-category"><strong>Filtrar por índice (Categoría):</strong></label>
            <select id="filter-category" class="filter-select">
              <option value="ALL">Mostrar todos los hábitats</option>
              <option value="Bosque">Bosque</option>
              <option value="Urbano">Urbano</option>
              <option value="Humedal">Humedal</option>
              <option value="Costa">Costa</option>
              <option value="Montaña">Montaña</option>
            </select>
          </div>

          <div id="sightings-list" class="sightings-list">
            ${renderSightingsList(sightings)}
          </div>
        </div>
      </div>

      <!-- Modal de Confirmación para Eliminar -->
      <div id="delete-modal" class="modal-backdrop" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-card">
          <div class="modal-icon">⚠️</div>
          <h3 id="modal-title">¿Eliminar avistamiento?</h3>
          <p id="modal-desc">¿Estás seguro de que deseas eliminar este registro de tu bitácora? Esta acción no se puede deshacer.</p>
          <div class="modal-actions">
            <button id="modal-cancel-btn" type="button" class="btn-modal-cancel">Cancelar</button>
            <button id="modal-confirm-btn" type="button" class="btn-modal-delete">🗑️ Sí, eliminar</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Función para generar las tarjetas de la lista
 */
export function renderSightingsList(items) {
  if (!items || items.length === 0) {
    return `
      <div class="card empty-state">
        <p>No hay avistamientos registrados.</p>
        <small>Utiliza el formulario para añadir tu primera observación.</small>
      </div>
    `;
  }

  return items
    .map(
      (item) => `
      <div class="card sighting-card" data-id="${item.id}">
        <div class="sighting-header">
          <h4>${item.birdName}</h4>
          <span class="category-badge badge-${item.category.toLowerCase()}">${item.category}</span>
        </div>
        <p class="sighting-detail"><strong>📍 Ubicación:</strong> ${item.location}</p>
        <p class="sighting-detail"><strong>📅 Fecha:</strong> ${item.date}</p>
        ${item.notes ? `<p class="sighting-notes"><em>"${item.notes}"</em></p>` : ""}
        <button type="button" class="btn-delete" data-delete-id="${item.id}">🗑️ Eliminar</button>
      </div>
    `
    )
    .join("");
}
