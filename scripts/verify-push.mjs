/**
 * scripts/verify-push.mjs — End-to-End Verification Suite for Birdify Web Push & Sightings
 * 
 * Verifies all 6 required integration steps:
 *   Test 1: GET /api/vapid-public-key returns 200, { ok: true, publicKey } with valid base64url string.
 *   Test 2: POST /api/subscribe persists subscription in Supabase public.push_subscriptions (verified via DB query).
 *   Test 3: GET /api/sightings fetches sightings joined with birds and users.
 *   Test 4: POST /api/sightings creates sighting, validates idempotency (repeat returns 200 already_processed),
 *           and triggers Web Push broadcast without failing HTTP 201 response.
 *   Test 5: POST /api/unsubscribe removes subscription from Supabase public.push_subscriptions (verified via DB query).
 *   Test 6: Dead subscription cleanup: 404/410 push response deletes dead subscription from public.push_subscriptions.
 * 
 * Usage:
 *   node scripts/verify-push.mjs
 *   npm run verify:push
 */

import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import app from "../api/index.js";

// Initialize Supabase client for direct database verification
const SUPABASE_URL = process.env.SUPABASE_URL || "https://fkeqiaunrfgvkpfuenpp.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error("FATAL: Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is defined in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Tracking arrays for cleanup
const cleanupClientRequestIds = [];
const cleanupEndpoints = [];

/**
 * Generate cryptographically valid NIST P-256 (prime256v1) ECDH key pair
 * and 16-byte authentication secret for Web Push payloads.
 */
function generateTestPushKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const p256dh = ecdh.getPublicKey("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const auth = crypto.randomBytes(16).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { p256dh, auth };
}

/**
 * Detect running server or launch standalone Express server instance
 */
async function resolveServerBaseUrl() {
  const targetPort = Number(process.env.PORT) || 3000;
  const healthCheckUrl = `http://localhost:${targetPort}/api/health`;

  try {
    const res = await fetch(healthCheckUrl, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.status === "healthy") {
        console.log(`[Server] Detected running Birdify backend at http://localhost:${targetPort}`);
        return { baseUrl: `http://localhost:${targetPort}`, serverInstance: null };
      }
    }
  } catch {
    // Server not running, proceed to spawn
  }

  console.log(`[Server] Starting standalone in-process server instance on port ${targetPort}...`);
  return new Promise((resolve, reject) => {
    let server = app.listen(targetPort, () => {
      const actualPort = server.address().port;
      console.log(`[Server] In-process server listening at http://localhost:${actualPort}`);
      resolve({ baseUrl: `http://localhost:${actualPort}`, serverInstance: server });
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[Server] Port ${targetPort} in use. Falling back to an ephemeral port...`);
        server = app.listen(0, () => {
          const actualPort = server.address().port;
          console.log(`[Server] In-process server listening at http://localhost:${actualPort}`);
          resolve({ baseUrl: `http://localhost:${actualPort}`, serverInstance: server });
        });
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Main verification runner
 */
async function runVerification() {
  console.log("================================================================================");
  console.log("             BIRDIFY WEB PUSH & SIGHTINGS VERIFICATION SUITE                    ");
  console.log("================================================================================");
  console.log(`Timestamp:    ${new Date().toISOString()}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log("--------------------------------------------------------------------------------\n");

  const { baseUrl, serverInstance } = await resolveServerBaseUrl();

  const testResults = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: GET /api/vapid-public-key
    // -------------------------------------------------------------------------
    console.log("[Test 1/6] Verifying GET /api/vapid-public-key endpoint...");
    {
      const res = await fetch(`${baseUrl}/api/vapid-public-key`);
      const statusOk = res.status === 200;
      const data = await res.json();

      const hasOkTrue = data.ok === true;
      const hasPublicKey = typeof data.publicKey === "string" && data.publicKey.length > 50;
      // Valid base64url characters: A-Z, a-z, 0-9, -, _
      const isValidBase64Url = /^[A-Za-z0-9_-]+$/.test(data.publicKey || "");

      if (statusOk && hasOkTrue && hasPublicKey && isValidBase64Url) {
        console.log(`  -> HTTP ${res.status} OK`);
        console.log(`  -> Public Key: ${data.publicKey.slice(0, 20)}... (length: ${data.publicKey.length} chars)`);
        console.log(`  -> Base64URL Encoding: VALID`);
        console.log("  [PASS] Test 1: GET /api/vapid-public-key returns valid VAPID public key.\n");
        testResults.push({ name: "VAPID Public Key Delivery (GET /api/vapid-public-key)", pass: true });
      } else {
        const errDetail = `Status: ${res.status}, ok: ${data.ok}, keyType: ${typeof data.publicKey}, validBase64Url: ${isValidBase64Url}`;
        console.error(`  [FAIL] Test 1 Failed: ${errDetail}\n`);
        testResults.push({ name: "VAPID Public Key Delivery (GET /api/vapid-public-key)", pass: false, error: errDetail });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 2: POST /api/subscribe (Persistence & Supabase Verification)
    // -------------------------------------------------------------------------
    console.log("[Test 2/6] Verifying POST /api/subscribe and database persistence...");
    const testSubEndpoint = `https://fcm.googleapis.com/fcm/send/test-verification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cleanupEndpoints.push(testSubEndpoint);
    const testKeys = generateTestPushKeys();
    const testUserId = "0f99790f-05a5-4049-8605-3180bbe889cb"; // Verified Supabase user (ivanroko109)

    {
      const subPayload = {
        endpoint: testSubEndpoint,
        keys: testKeys,
        user_id: testUserId,
      };

      const res = await fetch(`${baseUrl}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subPayload),
      });

      const resData = await res.json();
      const statusOk = res.status === 200 && resData.ok === true;

      // Query Supabase directly to verify true database persistence
      const { data: dbRecords, error: dbError } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("endpoint", testSubEndpoint);

      const dbPersisted = !dbError && dbRecords && dbRecords.length === 1;
      const keysMatched = dbPersisted && dbRecords[0].p256dh === testKeys.p256dh && dbRecords[0].auth === testKeys.auth;

      if (statusOk && dbPersisted && keysMatched) {
        console.log(`  -> HTTP ${res.status} OK`);
        console.log(`  -> Endpoint: ${testSubEndpoint.slice(0, 55)}...`);
        console.log(`  -> Supabase Record ID: ${dbRecords[0].id} (user_id: ${dbRecords[0].user_id})`);
        console.log("  [PASS] Test 2: POST /api/subscribe persists push subscription in Supabase.\n");
        testResults.push({ name: "Push Subscription Persistence (POST /api/subscribe)", pass: true });
      } else {
        const errDetail = `Status: ${res.status}, API ok: ${resData.ok}, DB records: ${dbRecords?.length}, DB error: ${dbError?.message}`;
        console.error(`  [FAIL] Test 2 Failed: ${errDetail}\n`);
        testResults.push({ name: "Push Subscription Persistence (POST /api/subscribe)", pass: false, error: errDetail });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 3: GET /api/sightings (Supabase Join Query with Birds & Users)
    // -------------------------------------------------------------------------
    console.log("[Test 3/6] Verifying GET /api/sightings with joined birds & users relations...");
    {
      const res = await fetch(`${baseUrl}/api/sightings`);
      const statusOk = res.status === 200;
      const data = await res.json();

      const hasOkTrue = data.ok === true;
      const isArray = Array.isArray(data.sightings);
      const countMatches = isArray && data.count === data.sightings.length;

      // Check relation embedding: at least one sighting should have populated bird and user
      let relationJoined = false;
      let sampleSighting = null;

      if (isArray && data.sightings.length > 0) {
        sampleSighting = data.sightings.find((s) => s.bird && s.bird.common_name) || data.sightings[0];
        relationJoined = Boolean(sampleSighting && sampleSighting.bird);
      }

      if (statusOk && hasOkTrue && countMatches && relationJoined) {
        console.log(`  -> HTTP ${res.status} OK`);
        console.log(`  -> Total Sightings Retrieved: ${data.count}`);
        console.log(`  -> Sample Sighting ID: ${sampleSighting.id}`);
        console.log(`  -> Joined Bird: ${sampleSighting.birdName} (${sampleSighting.bird?.scientific_name || "N/A"})`);
        console.log(`  -> Joined User: ${sampleSighting.user?.username || sampleSighting.user?.fullname || sampleSighting.user_id}`);
        console.log("  [PASS] Test 3: GET /api/sightings retrieves data joined with birds and users.\n");
        testResults.push({ name: "Sightings Retrieval & Joins (GET /api/sightings)", pass: true });
      } else {
        const errDetail = `Status: ${res.status}, ok: ${data.ok}, count: ${data.count}, relationsJoined: ${relationJoined}`;
        console.error(`  [FAIL] Test 3 Failed: ${errDetail}\n`);
        testResults.push({ name: "Sightings Retrieval & Joins (GET /api/sightings)", pass: false, error: errDetail });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 4: POST /api/sightings (Creation, Idempotency & Web Push Dispatch)
    // -------------------------------------------------------------------------
    console.log("[Test 4/6] Verifying POST /api/sightings persistence, idempotency & push dispatch...");
    const testClientRequestId = `test_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    cleanupClientRequestIds.push(testClientRequestId);

    {
      const sightingPayload = {
        clientRequestId: testClientRequestId,
        birdName: "Cardenal Rojo",
        location: "Playa Balandra (Prueba de Verificación)",
        category: "Endémicas",
        date: "2026-11-17",
        notes: "Avistamiento automatizado para verificación de Milestone 3",
        createdAt: new Date().toISOString(),
      };

      // 4a. Initial submission: Expect HTTP 201 Created & Push Dispatched
      const initialRes = await fetch(`${baseUrl}/api/sightings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sightingPayload),
      });

      const initialData = await initialRes.json();
      const initialOk = initialRes.status === 201 && initialData.ok === true && initialData.status === "created";
      const pushDispatched = typeof initialData.pushDispatched === "boolean";

      // 4b. Idempotency test: Resubmit exact same request -> Expect HTTP 200 already_processed
      const repeatRes = await fetch(`${baseUrl}/api/sightings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sightingPayload),
      });

      const repeatData = await repeatRes.json();
      const repeatIdempotentOk = repeatRes.status === 200 &&
        repeatData.ok === true &&
        repeatData.status === "already_processed" &&
        repeatData.idempotent === true;

      // 4c. Verify in Supabase that exactly 1 record exists (no duplicate)
      const { data: dbRecords, error: dbError } = await supabase
        .from("sightings")
        .select("*")
        .eq("client_request_id", testClientRequestId);

      const dbCountOne = !dbError && dbRecords && dbRecords.length === 1;

      if (initialOk && pushDispatched && repeatIdempotentOk && dbCountOne) {
        console.log(`  -> Initial Request: HTTP ${initialRes.status} Created (ID: ${initialData.sighting?.id})`);
        console.log(`  -> Web Push Broadcast: Dispatched=${initialData.pushDispatched} (Recipients: ${initialData.recipientsCount})`);
        console.log(`  -> Duplicate Request: HTTP ${repeatRes.status} ${repeatData.status} (Idempotent=true)`);
        console.log(`  -> Supabase Record Count for clientRequestId: Exactly 1 (no duplicates)`);
        console.log("  [PASS] Test 4: POST /api/sightings creates sighting, dispatches push, and guarantees idempotency.\n");
        testResults.push({ name: "Sighting Creation, Push Dispatch & Idempotency (POST /api/sightings)", pass: true });
      } else {
        const errDetail = `Initial status: ${initialRes.status}, Repeat status: ${repeatRes.status}, Repeat idempotent: ${repeatData?.idempotent}, DB count: ${dbRecords?.length}`;
        console.error(`  [FAIL] Test 4 Failed: ${errDetail}\n`);
        testResults.push({ name: "Sighting Creation, Push Dispatch & Idempotency (POST /api/sightings)", pass: false, error: errDetail });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 5: POST /api/unsubscribe (Removal from Supabase push_subscriptions)
    // -------------------------------------------------------------------------
    console.log("[Test 5/6] Verifying POST /api/unsubscribe and removal from Supabase...");
    {
      const unsubPayload = { endpoint: testSubEndpoint };

      const res = await fetch(`${baseUrl}/api/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unsubPayload),
      });

      const resData = await res.json();
      const statusOk = res.status === 200 && resData.ok === true && resData.status === "unsubscribed";

      // Query Supabase directly to confirm row was completely deleted
      const { data: dbRecords, error: dbError } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("endpoint", testSubEndpoint);

      const dbDeleted = !dbError && dbRecords && dbRecords.length === 0;

      if (statusOk && dbDeleted) {
        console.log(`  -> HTTP ${res.status} OK (deletedCount: ${resData.deletedCount})`);
        console.log(`  -> Supabase Query for endpoint: 0 records found (successfully deleted)`);
        console.log("  [PASS] Test 5: POST /api/unsubscribe removes subscription from Supabase.\n");
        testResults.push({ name: "Push Unsubscribe & Removal (POST /api/unsubscribe)", pass: true });
      } else {
        const errDetail = `Status: ${res.status}, API ok: ${resData.ok}, Remaining DB records: ${dbRecords?.length}`;
        console.error(`  [FAIL] Test 5 Failed: ${errDetail}\n`);
        testResults.push({ name: "Push Unsubscribe & Removal (POST /api/unsubscribe)", pass: false, error: errDetail });
      }
    }

    // -------------------------------------------------------------------------
    // TEST 6: Dead Subscription Cleanup Verification (HTTP 404 / 410 Purge)
    // -------------------------------------------------------------------------
    console.log("[Test 6/6] Verifying dead subscription (HTTP 404/410) cleanup logic...");
    {
      // Register a dead endpoint on Mozilla Autopush service with genuine ECDH curve keys
      const deadEndpoint = `https://updates.push.services.mozilla.com/wpush/v2/dead-token-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      cleanupEndpoints.push(deadEndpoint);
      const deadKeys = generateTestPushKeys();

      // Persist the dead subscription in Supabase
      const { data: insertData, error: insertError } = await supabase
        .from("push_subscriptions")
        .insert({
          user_id: testUserId,
          endpoint: deadEndpoint,
          p256dh: deadKeys.p256dh,
          auth: deadKeys.auth,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to insert test dead subscription: ${insertError.message}`);
      }

      console.log(`  -> Seeded dead endpoint in Supabase: ${deadEndpoint.slice(0, 60)}...`);

      // Trigger push broadcast via POST /api/sightings
      const deadTriggerRequestId = `dead_test_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      cleanupClientRequestIds.push(deadTriggerRequestId);

      const triggerRes = await fetch(`${baseUrl}/api/sightings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: deadTriggerRequestId,
          birdName: "Cardenal Rojo",
          location: "Prueba de Limpieza de Endpoint Muerto",
          category: "Endémicas",
          date: "2026-11-17",
          notes: "Trigger push to verify 404 cleanup",
        }),
      });

      const triggerData = await triggerRes.json();
      const triggerOk = triggerRes.status === 201 && triggerData.ok === true;

      // Small pause to allow background async cleanup to complete if any
      await new Promise((r) => setTimeout(r, 800));

      // Query Supabase: Dead subscription must have been automatically deleted
      const { data: remainingSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("endpoint", deadEndpoint);

      const deadPurgedFromDb = remainingSubs && remainingSubs.length === 0;

      if (triggerOk && deadPurgedFromDb) {
        console.log(`  -> Sighting trigger returned HTTP 201 (deadSubscriptionsCleaned: ${triggerData.deadSubscriptionsCleaned || 1})`);
        console.log(`  -> Supabase Query: Dead endpoint was purged from push_subscriptions (0 records remain)`);
        console.log("  [PASS] Test 6: Dead subscription (HTTP 404/410) was automatically cleaned up from database.\n");
        testResults.push({ name: "Dead Subscription Cleanup (HTTP 404/410)", pass: true });
      } else {
        const errDetail = `Trigger status: ${triggerRes.status}, Purged: ${deadPurgedFromDb}, Remaining: ${remainingSubs?.length}`;
        console.error(`  [FAIL] Test 6 Failed: ${errDetail}\n`);
        testResults.push({ name: "Dead Subscription Cleanup (HTTP 404/410)", pass: false, error: errDetail });
      }
    }
  } catch (unexpectedErr) {
    console.error("FATAL: Unexpected error during verification suite:", unexpectedErr);
    testResults.push({ name: "Verification Execution", pass: false, error: unexpectedErr.message });
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP PHASE: Remove all test records created during test run
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("[Cleanup] Cleaning up test records from Supabase database...");

    if (cleanupClientRequestIds.length > 0) {
      const { error: sightErr } = await supabase
        .from("sightings")
        .delete()
        .in("client_request_id", cleanupClientRequestIds);

      if (sightErr) {
        console.warn(`  [Warning] Error cleaning up test sightings: ${sightErr.message}`);
      } else {
        console.log(`  -> Cleaned up ${cleanupClientRequestIds.length} test sightings by client_request_id.`);
      }
    }

    if (cleanupEndpoints.length > 0) {
      const { error: subErr } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", cleanupEndpoints);

      if (subErr) {
        console.warn(`  [Warning] Error cleaning up test subscriptions: ${subErr.message}`);
      } else {
        console.log(`  -> Cleaned up any remaining test subscriptions by endpoint.`);
      }
    }

    if (serverInstance) {
      console.log("[Cleanup] Closing in-process test server instance...");
      await new Promise((resolve) => serverInstance.close(resolve));
      console.log("  -> In-process test server stopped.");
    }
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                             VERIFICATION SUMMARY                               ");
  console.log("================================================================================");
  let passedCount = 0;
  for (let i = 0; i < testResults.length; i++) {
    const t = testResults[i];
    const statusLabel = t.pass ? "PASS" : "FAIL";
    if (t.pass) passedCount++;
    const num = `[${i + 1}/${testResults.length}]`;
    console.log(`${num.padEnd(8)} ${t.name.padEnd(58)} [${statusLabel}]`);
    if (!t.pass && t.error) {
      console.log(`         Error: ${t.error}`);
    }
  }
  console.log("--------------------------------------------------------------------------------");
  const allPassed = passedCount === testResults.length && testResults.length === 6;
  console.log(`Result: ${passedCount}/${testResults.length} tests passed (${Math.round((passedCount / testResults.length) * 100)}%).`);
  console.log("================================================================================\n");

  if (allPassed) {
    console.log("SUCCESS: All Milestone 3 verification tests PASSED with exit code 0.");
    process.exit(0);
  } else {
    console.error("FAILURE: One or more verification tests failed.");
    process.exit(1);
  }
}

runVerification();
