import { obtenerUbicacion } from '../utils/geolocation.js';
import { compartirFicha } from '../utils/share.js';

export const renderizarAvistamiento = () => {
  document.getElementById('app').innerHTML = `
    <h2>Registrar Nuevo Avistamiento</h2>
    <button id="btn-ubicacion">📍 Adjuntar mi ubicación</button>
    <div id="contenedor-alternativa"></div>
    <br><br>
    <button id="btn-compartir">📤 Compartir este avistamiento</button>
  `;

  document.getElementById('btn-ubicacion').addEventListener('click', manejarUbicacion);
  document.getElementById('btn-compartir').addEventListener('click', () => {
    compartirFicha("Avistamiento en Birdify", "Mira esta ave que encontré", window.location.href);
  });
};

const manejarUbicacion = async () => {
  const contenedor = document.getElementById('contenedor-alternativa');
  const estadoPermiso = await navigator.permissions.query({ name: 'geolocation' });
  
  if (estadoPermiso.state === 'denied') {
    mostrarInputManual(contenedor, "Ubicación bloqueada. Ingresa la dirección del avistamiento manualmente o cambia los permisos del navegador:");
    return;
  }
  if (confirm("Birdify usará tu ubicación para registrar exactamente dónde viste el ave. ¿Continuar?")) {
    try {
      const coordenadas = await obtenerUbicacion();
      alert(`Ubicación guardada: Lat ${coordenadas.lat}, Lng ${coordenadas.lng}`);
    } catch (error) {
      alert(error.message);
      mostrarInputManual(contenedor, "Hubo un error. Ingresa la dirección manualmente:");
    }
  }
};

const mostrarInputManual = (contenedor, mensaje) => {
  contenedor.innerHTML = `
    <p style="color: red; font-size: 14px;">${mensaje}</p>
    <input type="text" placeholder="Ej. Parque Central, Zona Norte" id="input-ubicacion-manual" />
  `;
};