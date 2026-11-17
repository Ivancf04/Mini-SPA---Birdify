/**
 * api/index.js — Backend Express App & Serverless Entrypoint for Birdify
 * 
 * Provides REST API endpoints for:
 * - Health check (/api/health)
 * - VAPID Public Key delivery (/api/vapid-public-key)
 * - Push subscription lifecycle (/api/subscribe, /api/unsubscribe)
 * - Sightings persistence & Web Push dispatch (/api/sightings)
 * 
 * Compatible with both Vercel Serverless Functions and local Node.js server.
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const app = express();

// ---------------------------------------------------------------------------
// 1. Configuration & Clients Initialization
// ---------------------------------------------------------------------------
const DEFAULT_BIRD_ID = "7ee45d51-9155-419b-8691-b78a14cc8179"; // Cardenal Rojo
const DEFAULT_USER_ID = "0f99790f-05a5-4049-8605-3180bbe889cb"; // ivanroko109

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fkeqiaunrfgvkpfuenpp.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.warn("[Backend Warning] Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is set.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY || "", {
  auth: { persistSession: false },
});

// Configure web-push with VAPID details
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:ivanroko109@gmail.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log("[Backend] Web-push VAPID details configured successfully.");
  } catch (err) {
    console.error("[Backend] Error configuring VAPID details:", err.message);
  }
} else {
  console.warn("[Backend Warning] VAPID keys missing. Web Push dispatch will be unavailable.");
}

// In-memory cache for fast idempotency checks
const recentClientRequests = new Map();

// ---------------------------------------------------------------------------
// 2. Middleware & CORS Configuration
// ---------------------------------------------------------------------------
const rawAllowedOrigins = process.env.ALLOWED_ORIGIN || "http://localhost:3000,http://127.0.0.1:5500,https://ivanroko109.github.io";
const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Permit server-to-server, curl, mobile, or requests without Origin header
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/+$/, "");
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // In non-production, permit localhost and 127.0.0.1 on any port
    if (process.env.NODE_ENV !== "production") {
      try {
        const parsed = new URL(origin);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          return callback(null, true);
        }
      } catch {
        // Ignored, proceed to rejection
      }
    }

    console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
    return callback(new Error(`Origin ${origin} not permitted by CORS policy`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Client-Request-Id", "X-Simulate-Error"],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// 3. API Router Definition
// ---------------------------------------------------------------------------
const router = express.Router();

// GET /api/health — System health check
router.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    service: "Birdify Backend API",
    timestamp: new Date().toISOString(),
    vapidConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    supabaseConnected: Boolean(SUPABASE_KEY),
  });
});

// GET /api/vapid-public-key — Expose public key to PWA clients
router.get("/vapid-public-key", (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(500).json({
      ok: false,
      error: "VAPID public key is not configured on the server.",
    });
  }

  res.status(200).json({
    ok: true,
    publicKey: VAPID_PUBLIC_KEY,
  });
});

// POST /api/subscribe — Register or update client push subscription
router.post("/subscribe", async (req, res) => {
  try {
    const body = req.body || {};
    const endpoint = body.endpoint || body.subscription?.endpoint;
    const p256dh = body.keys?.p256dh || body.subscription?.keys?.p256dh || body.p256dh;
    const auth = body.keys?.auth || body.subscription?.keys?.auth || body.auth;
    const userId = body.user_id || body.userId || DEFAULT_USER_ID;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({
        ok: false,
        error: "Suscripción incompleta. Se requieren endpoint, keys.p256dh y keys.auth.",
      });
    }

    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: String(userId),
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      )
      .select()
      .single();

    if (error) {
      console.error("[Backend] Error saving push subscription in Supabase:", error);
      return res.status(500).json({
        ok: false,
        error: `Error al persistir la suscripción: ${error.message}`,
      });
    }

    res.status(200).json({
      ok: true,
      status: "subscribed",
      subscription: data || { endpoint, user_id: userId },
      message: "Suscripción a notificaciones push registrada exitosamente.",
    });
  } catch (err) {
    console.error("[Backend] Exception in /api/subscribe:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/unsubscribe & DELETE /api/subscribe — Remove subscription
const handleUnsubscribe = async (req, res) => {
  try {
    const endpoint = req.body?.endpoint || req.query?.endpoint;

    if (!endpoint) {
      return res.status(400).json({
        ok: false,
        error: "El campo endpoint es obligatorio para cancelar la suscripción.",
      });
    }

    const { data, error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .select();

    if (error) {
      console.error("[Backend] Error deleting subscription from Supabase:", error);
      return res.status(500).json({
        ok: false,
        error: `Error al eliminar la suscripción: ${error.message}`,
      });
    }

    res.status(200).json({
      ok: true,
      status: "unsubscribed",
      deletedCount: data?.length || 0,
      message: "Suscripción eliminada exitosamente.",
    });
  } catch (err) {
    console.error("[Backend] Exception in unsubscribe:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

router.post("/unsubscribe", handleUnsubscribe);
router.delete("/subscribe", handleUnsubscribe);

// GET /api/sightings — Retrieve sightings joined with birds & users
router.get("/sightings", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sightings")
      .select("*, birds(id, common_name, scientific_name), users!sightings_user_id_fkey(id, username, fullname)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Backend] Error querying sightings from Supabase:", error);
      return res.status(500).json({
        ok: false,
        error: `Error al consultar avistamientos: ${error.message}`,
      });
    }

    const sightings = (data || []).map((s) => ({
      id: s.id,
      serverId: s.id,
      clientRequestId: s.client_request_id || null,
      bird_id: s.bird_id,
      user_id: s.user_id,
      birdName: s.birds?.common_name || "Desconocida",
      scientificName: s.birds?.scientific_name || null,
      description: s.description || "",
      notes: s.description || "",
      location: s.location || (s.description ? s.description.split("\n")[0].replace(/^\[.*?\]\s*/, "") : "Ubicación registrada"),
      category: s.category || "General",
      date: s.sighting_date ? s.sighting_date.split("T")[0] : "",
      sighting_date: s.sighting_date,
      createdAt: s.created_at,
      created_at: s.created_at,
      latitude: s.latitude,
      longitude: s.longitude,
      photo_url: s.photo_url,
      user: s.users || null,
      bird: s.birds || null,
    }));

    res.status(200).json({
      ok: true,
      count: sightings.length,
      sightings,
    });
  } catch (err) {
    console.error("[Backend] Exception in GET /api/sightings:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/sightings — Persist sighting in Supabase & broadcast Web Push notification
router.post("/sightings", async (req, res) => {
  try {
    const payload = req.body || {};

    // Support simulated server error for resilience/contingency testing
    const simulateErrorHeader = req.headers["x-simulate-error"];
    if (simulateErrorHeader || payload.simulateError) {
      const errorStatus = Number(simulateErrorHeader) || Number(payload.simulateError) || 500;
      console.warn(`[Backend] Test error HTTP ${errorStatus} simulated as requested.`);
      return res.status(errorStatus).json({
        ok: false,
        error: `Error de servidor simulado HTTP ${errorStatus} para pruebas de contingencia.`,
      });
    }

    // Extract clientRequestId from body or header
    const clientRequestId = payload.clientRequestId || req.headers["x-client-request-id"];
    if (!clientRequestId || typeof clientRequestId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo clientRequestId es obligatorio y debe ser un string único.",
      });
    }

    // 1. Idempotency Check: Memory Cache & Supabase Database
    if (recentClientRequests.has(clientRequestId)) {
      const cached = recentClientRequests.get(clientRequestId);
      console.log(`[Backend][Idempotencia] clientRequestId '${clientRequestId}' encontrado en caché en memoria. Retornando 200.`);
      return res.status(200).json({
        ok: true,
        status: "already_processed",
        idempotent: true,
        clientRequestId,
        sighting: cached,
        message: "Avistamiento ya registrado previamente en el servidor (idempotente).",
      });
    }

    const { data: existingSighting } = await supabase
      .from("sightings")
      .select("*, birds(id, common_name, scientific_name), users!sightings_user_id_fkey(id, username, fullname)")
      .eq("client_request_id", clientRequestId)
      .maybeSingle();

    if (existingSighting) {
      recentClientRequests.set(clientRequestId, existingSighting);
      console.log(`[Backend][Idempotencia] clientRequestId '${clientRequestId}' encontrado en Supabase. Retornando 200.`);
      return res.status(200).json({
        ok: true,
        status: "already_processed",
        idempotent: true,
        clientRequestId,
        sighting: existingSighting,
        message: "Avistamiento ya registrado previamente en Supabase (idempotente).",
      });
    }

    // 2. Validate Sighting Data
    const {
      birdName,
      location,
      category,
      date,
      notes,
      createdAt,
      bird_id,
      user_id,
      description,
      latitude,
      longitude,
      photo_url,
      sighting_date,
    } = payload;

    if (!birdName && !bird_id) {
      return res.status(400).json({
        ok: false,
        error: "Debe especificarse birdName o bird_id para registrar el avistamiento.",
      });
    }

    // 3. Resolve bird_id and common_name
    let resolvedBirdId = bird_id;
    let resolvedBirdName = birdName ? String(birdName).trim() : "";

    if (!resolvedBirdId && resolvedBirdName) {
      const { data: birdMatches } = await supabase
        .from("birds")
        .select("id, common_name")
        .ilike("common_name", resolvedBirdName)
        .limit(1);

      if (birdMatches && birdMatches.length > 0) {
        resolvedBirdId = birdMatches[0].id;
        resolvedBirdName = birdMatches[0].common_name;
      } else {
        // Fallback to default catalog bird
        resolvedBirdId = DEFAULT_BIRD_ID;
      }
    }

    if (!resolvedBirdId) {
      resolvedBirdId = DEFAULT_BIRD_ID;
      resolvedBirdName = resolvedBirdName || "Cardenal Rojo";
    }

    // 4. Resolve user_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let resolvedUserId = user_id && uuidRegex.test(String(user_id)) ? String(user_id) : DEFAULT_USER_ID;

    // 5. Resolve sighting_date and description
    let resolvedDate;
    if (sighting_date) {
      resolvedDate = new Date(sighting_date).toISOString();
    } else if (date) {
      resolvedDate = new Date(date).toISOString();
    } else {
      resolvedDate = new Date().toISOString();
    }

    let resolvedDescription = description;
    if (!resolvedDescription) {
      const parts = [];
      if (category) parts.push(`[${category}]`);
      if (location) parts.push(`@ ${location}`);
      if (notes) parts.push(`- ${notes}`);
      resolvedDescription = parts.join(" ") || null;
    }

    // 6. Insert Sighting in Supabase
    const insertPayload = {
      client_request_id: clientRequestId,
      user_id: resolvedUserId,
      bird_id: resolvedBirdId,
      description: resolvedDescription,
      latitude: typeof latitude === "number" ? latitude : null,
      longitude: typeof longitude === "number" ? longitude : null,
      photo_url: photo_url || null,
      sighting_date: resolvedDate,
      is_location_private: Boolean(payload.is_location_private || false),
    };

    const { data: insertedSighting, error: insertError } = await supabase
      .from("sightings")
      .insert(insertPayload)
      .select("*, birds(id, common_name, scientific_name), users!sightings_user_id_fkey(id, username, fullname)")
      .single();

    if (insertError) {
      // Check if duplicate key violation occurred concurrently
      if (insertError.code === "23505") {
        return res.status(200).json({
          ok: true,
          status: "already_processed",
          idempotent: true,
          clientRequestId,
          message: "Avistamiento registrado concurrentemente (idempotente).",
        });
      }

      console.error("[Backend] Error inserting sighting into Supabase:", insertError);
      return res.status(500).json({
        ok: false,
        error: `Error al persistir el avistamiento: ${insertError.message}`,
      });
    }

    // Populate resolvedBirdName from joined bird record when client submitted bird_id without birdName
    if (!resolvedBirdName) {
      resolvedBirdName = insertedSighting.birds?.common_name || "Ave registrada";
    }

    // Store in memory cache (cap to 500 items)
    if (recentClientRequests.size > 500) {
      const oldestKey = recentClientRequests.keys().next().value;
      recentClientRequests.delete(oldestKey);
    }
    recentClientRequests.set(clientRequestId, insertedSighting);

    console.log(`[Backend] Sighting persisted: "${resolvedBirdName}" [ID: ${insertedSighting.id}] [Req: ${clientRequestId}]`);

    // 7. Dispatch Web Push Broadcast
    let pushDispatched = false;
    let recipientsCount = 0;
    let pushDelivered = 0;
    let deadSubscriptionsCleaned = 0;

    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      try {
        const { data: subscriptions, error: subsError } = await supabase
          .from("push_subscriptions")
          .select("*");

        if (subsError) {
          console.warn("[Backend] Warning querying push_subscriptions for dispatch:", subsError.message);
        } else if (subscriptions && subscriptions.length > 0) {
          recipientsCount = subscriptions.length;
          pushDispatched = true;

          const locationText = location ? ` en ${location}` : "";
          const pushPayload = JSON.stringify({
            title: "¡Nuevo avistamiento en Birdify!",
            body: `Se ha registrado un avistamiento de «${resolvedBirdName}»${locationText}.`,
            icon: "/icons/icon-192.png",
            badge: "/icons/favicon-32.png",
            data: {
              url: "/avistamientos",
              sightingId: insertedSighting.id,
              clientRequestId,
              timestamp: new Date().toISOString(),
            },
          });

          // Dispatch in parallel using Promise.allSettled with TTL 3600
          const pushTasks = subscriptions.map(async (sub) => {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                  },
                },
                pushPayload,
                { TTL: 3600 }
              );
              pushDelivered++;
            } catch (err) {
              const statusCode = err.statusCode || err.status;
              if (statusCode === 404 || statusCode === 410) {
                // Subscription has expired or unsubscribed on push service: purge from DB
                console.warn(`[Push Cleanup] Endpoint muerto (HTTP ${statusCode}). Purgando: ${sub.endpoint}`);
                try {
                  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                  deadSubscriptionsCleaned++;
                } catch (delErr) {
                  console.error("[Push Cleanup Error] No se pudo purgar suscripción muerta:", delErr.message);
                }
              } else if (statusCode === 429) {
                console.warn(`[Push Rate-Limit] HTTP 429 recibido para endpoint: ${sub.endpoint}`);
              } else {
                console.warn(`[Push Notice] Error no fatal enviando push a ${sub.endpoint}:`, err.message);
              }
            }
          });

          await Promise.allSettled(pushTasks);
        }
      } catch (pushErr) {
        // Non-blocking resilience: push dispatch failure must not fail HTTP 201
        console.error("[Backend Non-Blocking Push Error]:", pushErr.message);
      }
    }

    // 8. Return HTTP 201 Created Response
    res.status(201).json({
      ok: true,
      status: "created",
      clientRequestId,
      sighting: insertedSighting,
      pushDispatched,
      recipientsCount,
      pushDelivered,
      deadSubscriptionsCleaned,
      message: "Avistamiento persistido exitosamente en Supabase.",
      serverTimestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Backend] Exception in POST /api/sightings:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/sightings — Test utility endpoint
router.delete("/sightings", async (req, res) => {
  try {
    const clientRequestId = req.query?.clientRequestId || req.body?.clientRequestId;
    if (clientRequestId) {
      await supabase.from("sightings").delete().eq("client_request_id", clientRequestId);
      recentClientRequests.delete(clientRequestId);
      return res.status(200).json({ ok: true, message: `Avistamiento ${clientRequestId} eliminado.` });
    }

    res.status(200).json({
      ok: true,
      message: "Endpoint de limpieza verificado.",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Mount Router under both /api and root (for local & Vercel rewrite compatibility)
// ---------------------------------------------------------------------------
app.use("/api", router);
app.use(router);

// 404 Handler for unrecognized API routes
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl || req.url}`,
  });
});

export default app;
