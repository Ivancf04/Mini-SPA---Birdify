/**
 * server.js — Servidor backend local para Birdify
 * 
 * Importa la aplicación Express configurada en api/index.js
 * e inicializa la escucha en el puerto configurado (PORT || 3000).
 * 
 * Uso:
 *   npm start
 *   npm run dev
 */

import app from "./api/index.js";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Birdify Backend Server activo en: http://localhost:${PORT}`);
  console.log(`   - Health check:     http://localhost:${PORT}/api/health`);
  console.log(`   - VAPID Public Key: http://localhost:${PORT}/api/vapid-public-key`);
  console.log(`   - Avistamientos:    http://localhost:${PORT}/api/sightings`);
  console.log(`   - Suscripciones:    http://localhost:${PORT}/api/subscribe`);
  console.log(`======================================================\n`);
});
