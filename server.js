/**
 * server.js — Servidor backend mínimo de desarrollo para Birdify
 * 
 * Proporciona persistencia real en disco (data/server-sightings.json),
 * soporte CORS completo e idempotencia mediante clientRequestId.
 * 
 * Uso:
 *   node server.js
 *   PORT=3000 node server.js
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, "data", "server-sightings.json");

// Asegurar que el archivo de datos exista con un array JSON
async function initStorage() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2), "utf8");
    console.log(`[Backend] Archivo de persistencia inicializado: ${DATA_FILE}`);
  }
}

async function readSightings() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[Backend] Error al leer archivo de avistamientos:", err);
    return [];
  }
}

async function writeSightings(sightings) {
  await fs.writeFile(DATA_FILE, JSON.stringify(sightings, null, 2), "utf8");
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Client-Request-Id, X-Simulate-Error",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Manejo de preflight CORS
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Client-Request-Id, X-Simulate-Error",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // 1. Health check
  if (pathname === "/api/health" && method === "GET") {
    sendJson(res, 200, {
      ok: true,
      status: "healthy",
      service: "Birdify Real Backend",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 2. GET /api/sightings: Consultar todos los avistamientos persistidos
  if (pathname === "/api/sightings" && method === "GET") {
    const sightings = await readSightings();
    sendJson(res, 200, {
      ok: true,
      count: sightings.length,
      sightings,
    });
    return;
  }

  // 3. POST /api/sightings: Publicar / Sincronizar un avistamiento
  if (pathname === "/api/sightings" && method === "POST") {
    let bodyText = "";
    req.on("data", (chunk) => {
      bodyText += chunk;
      // Protección contra payloads excesivos
      if (bodyText.length > 1e6) {
        req.destroy();
      }
    });

    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        sendJson(res, 400, {
          ok: false,
          error: "Cuerpo de solicitud inválido; se esperaba JSON.",
        });
        return;
      }

      // Soporte para pruebas: simulación voluntaria de error de servidor
      const simulateErrorHeader = req.headers["x-simulate-error"];
      if (simulateErrorHeader || payload.simulateError) {
        const errorStatus = Number(simulateErrorHeader) || 500;
        console.warn(`[Backend] Simulación de error HTTP ${errorStatus} solicitada para prueba.`);
        sendJson(res, errorStatus, {
          ok: false,
          error: `Error de servidor simulado HTTP ${errorStatus} para pruebas de contingencia.`,
        });
        return;
      }

      // Validación de datos de negocio y operación
      const { clientRequestId, birdName, location, category, date, notes, createdAt } = payload;
      if (!clientRequestId || typeof clientRequestId !== "string") {
        sendJson(res, 400, {
          ok: false,
          error: "El campo clientRequestId es obligatorio y debe ser un string único.",
        });
        return;
      }

      if (!birdName || !location || !category || !date) {
        sendJson(res, 400, {
          ok: false,
          error: "Faltan campos obligatorios: birdName, location, category y date.",
        });
        return;
      }

      const sightings = await readSightings();

      // Idempotencia: Verificar si clientRequestId ya fue procesado
      const existing = sightings.find((s) => s.clientRequestId === clientRequestId);
      if (existing) {
        console.log(`[Backend][Idempotencia] clientRequestId '${clientRequestId}' ya existía. Retornando 200 sin duplicar.`);
        sendJson(res, 200, {
          ok: true,
          status: "already_processed",
          idempotent: true,
          clientRequestId,
          sighting: existing,
          message: "Avistamiento ya registrado previamente en el servidor (idempotente).",
          serverTimestamp: new Date().toISOString(),
        });
        return;
      }

      // Nuevo registro persistente
      const newRecord = {
        serverId: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        clientRequestId,
        birdName: String(birdName).trim(),
        location: String(location).trim(),
        category: String(category).trim(),
        date: String(date),
        notes: notes ? String(notes).trim() : "",
        clientCreatedAt: createdAt || new Date().toISOString(),
        serverReceivedAt: new Date().toISOString(),
      };

      sightings.unshift(newRecord);
      await writeSightings(sightings);

      console.log(`[Backend] Nuevo avistamiento persistido: "${newRecord.birdName}" [clientRequestId: ${clientRequestId}]`);
      sendJson(res, 201, {
        ok: true,
        status: "created",
        clientRequestId,
        sighting: newRecord,
        message: "Avistamiento persistido exitosamente en el servidor.",
        serverTimestamp: newRecord.serverReceivedAt,
      });
    });
    return;
  }

  // 4. DELETE /api/sightings: Limpieza para entornos de prueba
  if (pathname === "/api/sightings" && method === "DELETE") {
    await writeSightings([]);
    console.log("[Backend] Base de datos de avistamientos remotos vaciada.");
    sendJson(res, 200, {
      ok: true,
      message: "Todos los avistamientos del servidor han sido eliminados.",
    });
    return;
  }

  // Ruta no encontrada
  sendJson(res, 404, {
    ok: false,
    error: `Ruta no encontrada: ${method} ${pathname}`,
  });
});

await initStorage();
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Birdify Backend Server activo en: http://localhost:${PORT}`);
  console.log(`   - Endpoint POST: http://localhost:${PORT}/api/sightings`);
  console.log(`   - Endpoint GET:  http://localhost:${PORT}/api/sightings`);
  console.log(`   - Persistencia:  ${DATA_FILE}`);
  console.log(`======================================================\n`);
});
