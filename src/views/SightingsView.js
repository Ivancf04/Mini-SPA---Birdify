import { getAllSightings, getOutboxCount } from "../services/dbService.js";
import { getSyncModeLabel, isBackgroundSyncActive } from "../services/syncService.js";

export default async function SightingsView() {
  let sightings = [];
  let outboxCount = 0;

  try {
    sightings = await getAllSightings();
    outboxCount = await getOutboxCount();
  } catch (error) {
    console.error("Error al cargar avistamientos desde IndexedDB:", error);
  }

  const isBgSync = isBackgroundSyncActive();
  const modeLabel = getSyncModeLabel();

  return `
    <section class="view-sightings">
      <div class="sightings-header">
        <h2>Bitácora de Avistamientos</h2>
        <p class="subtitle">Registra tus observaciones de aves con enfoque Offline-First: persistencia local inmediata y sincronización remota.</p>
      </div>

      <!-- Barra de Estado de Sincronización (Requisitos 3, 4 y 5) -->
      <div class="sync-status-toolbar card" id="sync-toolbar">
        <div class="sync-toolbar-left">
          <div class="sync-mode-indicator">
            <span class="sync-mode-badge ${isBgSync ? "sync-mode-badge--bgsync" : "sync-mode-badge--compatible"}" id="sync-mode-badge">
              ${isBgSync ? "⚡ Modo Background Sync" : "🔄 Modo compatible: reintentos al abrir, recuperar conexión o pulsar el botón"}
            </span>
          </div>
          <div class="sync-pending-info">
            <span>Operaciones en cola de envío:</span>
            <span class="badge-pending-count ${outboxCount > 0 ? "badge-pending-count--has" : ""}" id="pending-count-badge">
              ${outboxCount} pendientes
            </span>
          </div>
        </div>
        <div class="sync-toolbar-right">
          <button type="button" id="btn-retry-sync" class="btn-retry-sync" title="Procesar cola outbox ahora">
            🔄 Reintentar ahora
          </button>
        </div>
      </div>

      <!-- Aviso útil en caso de bloqueo de versión de IndexedDB (Requisito 2) -->
      <div id="db-blocked-alert" class="feedback-banner feedback-banner--error" style="display: none;" role="alert">
        ⚠️ <strong>Actualización de base de datos pausada:</strong> Hay otra pestaña abierta con una versión anterior. Cierra o recarga esa pestaña para que los cambios surtan efecto.
      </div>

      <!-- Zona de mensajes de feedback al usuario: diferencia explícita entre guardado local y confirmación de servidor -->
      <div id="db-feedback" class="feedback-banner" style="display: none;" role="alert"></div>

      <div class="sightings-layout">
        <!-- Formulario para agregar registros -->
        <div class="card sightings-form-card">
          <h3>Nuevo Avistamiento</h3>
          <p class="form-instruction">Al guardar, se registrará inmediatamente en el dispositivo y se programará su envío.</p>

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

            <button type="submit" class="btn-save" id="btn-submit-sighting">
              💾 Guardar Avistamiento (Offline-First)
            </button>
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
          <p id="modal-desc">¿Estás seguro de que deseas eliminar este registro de tu bitácora? También se cancelará su envío si estaba pendiente.</p>
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
 * Función para generar las tarjetas de la lista, mostrando estado de sincronización y mensajes de error
 */
export function renderSightingsList(items) {
  if (!items || items.length === 0) {
    return `
      <div class="card empty-state">
        <p>No hay avistamientos registrados.</p>
        <small>Utiliza el formulario para añadir tu primera observación en modo offline-first.</small>
      </div>
    `;
  }

  // Ordenar los más recientes primero
  const sorted = [...items].sort((a, b) => (b.id || 0) - (a.id || 0));

  return sorted
    .map((item) => {
      // Estado de sincronización: pendiente, sincronizando, error o enviado (confirmado)
      const syncStatus = item.syncStatus || (item.serverConfirmed ? "synced" : "pending");
      let statusBadge = "";

      if (syncStatus === "synced" || item.serverConfirmed) {
        statusBadge = `<span class="sync-badge sync-badge--synced" title="Confirmado y persistido por el servidor backend">☁️ Confirmado por el servidor</span>`;
      } else if (syncStatus === "syncing") {
        statusBadge = `<span class="sync-badge sync-badge--syncing" title="Enviando al servidor...">🔄 Sincronizando...</span>`;
      } else if (syncStatus === "failed") {
        statusBadge = `<span class="sync-badge sync-badge--failed" title="La última tentativa falló">⚠️ Error de envío</span>`;
      } else {
        statusBadge = `<span class="sync-badge sync-badge--pending" title="Guardado localmente en IndexedDB. En espera de envío.">📱 Guardado en dispositivo (Pendiente)</span>`;
      }

      return `
      <div class="card sighting-card sighting-card--${syncStatus}" data-id="${item.id}" data-request-id="${item.clientRequestId || ""}">
        <div class="sighting-header">
          <div class="sighting-title-group">
            <h4>${item.birdName}</h4>
            <span class="category-badge badge-${item.category ? item.category.toLowerCase() : "default"}">${item.category}</span>
          </div>
          <div class="sighting-status-group">
            ${statusBadge}
          </div>
        </div>

        <p class="sighting-detail"><strong>📍 Ubicación:</strong> ${item.location}</p>
        <p class="sighting-detail"><strong>📅 Fecha:</strong> ${item.date}</p>
        ${item.notes ? `<p class="sighting-notes"><em>"${item.notes}"</em></p>` : ""}

        <!-- Mostrar último error cuando corresponda (Requisito 3) -->
        ${
          item.syncError
            ? `<div class="sighting-error-banner"><strong>Último error:</strong> ${item.syncError}</div>`
            : ""
        }

        <div class="sighting-footer">
          <div class="sighting-meta">
            ${
              item.clientRequestId
                ? `<span class="meta-req-id" title="Identificador de idempotencia: ${item.clientRequestId}">Op: <code>${item.clientRequestId.slice(0, 8)}…</code></span>`
                : ""
            }
            ${
              item.syncedAt
                ? `<span class="meta-synced-at">Confirmado: ${new Date(item.syncedAt).toLocaleTimeString()}</span>`
                : ""
            }
          </div>
          <button type="button" class="btn-delete" data-delete-id="${item.id}">🗑️ Eliminar</button>
        </div>
      </div>
    `;
    })
    .join("");
}
