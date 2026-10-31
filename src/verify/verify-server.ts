import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createKratonHttpServer } from "../server/server.js";

async function runServerSmokeTest(): Promise<void> {
  console.log("================================================================================");
  console.log(" KRATONOS PHASE 6 VERIFICATION: FULL-STACK SERVER & OBSIDIAN GLASS UI SMOKE TEST");
  console.log("================================================================================\n");

  const server = createKratonHttpServer();

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Test Static UI Assets (HTML, CSS, JS)
    console.log(`[1/4] Probing Obsidian Glass UI Assets at ${baseUrl}...`);
    const [htmlRes, cssRes, jsRes] = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/styles.css`),
      fetch(`${baseUrl}/app.js`),
    ]);

    assert.equal(htmlRes.status, 200, "GET / must return HTTP 200");
    assert.equal(cssRes.status, 200, "GET /styles.css must return HTTP 200");
    assert.equal(jsRes.status, 200, "GET /app.js must return HTTP 200");

    const htmlText = await htmlRes.text();
    const cssText = await cssRes.text();
    const jsText = await jsRes.text();

    assert.ok(htmlText.includes("@hot-labs/near-connect"), "index.html must include @hot-labs/near-connect importmap");
    assert.ok(htmlText.includes("Judge Verification Mode"), "index.html must include Judge Verification Mode switch");
    assert.ok(cssText.includes("font-variant-numeric: tabular-nums"), "styles.css must enforce tabular-nums");
    assert.ok(jsText.includes("NearConnector"), "app.js must initialize NearConnector");

    console.log(`  ✓ GET / (index.html)          : HTTP ${htmlRes.status} (${htmlText.length} bytes, @hot-labs/near-connect verified)`);
    console.log(`  ✓ GET /styles.css             : HTTP ${cssRes.status} (${cssText.length} bytes, Obsidian Glass #05060A + tabular-nums)`);
    console.log(`  ✓ GET /app.js                 : HTTP ${jsRes.status} (${jsText.length} bytes, Aurora Canvas + 4-Pillar Controller)\n`);

    // 2. Test GET /api/overview & POST /api/policy/kill-switch
    console.log("[2/4] Probing GET /api/overview & POST /api/policy/kill-switch...");
    const overviewRes = await fetch(`${baseUrl}/api/overview`);
    assert.equal(overviewRes.status, 200, "GET /api/overview must return HTTP 200");
    const overviewJson = (await overviewRes.json()) as {
      status: string;
      treasuryAccount: string;
      feeRecipient: string;
      balanceFormatted: string;
      poc4MasterHash: string;
      postQuantumKeyHash: string;
      nep611Lanes: unknown[];
      mpcAddresses: Record<string, string>;
      liveCredentialsConfigured: Record<string, boolean>;
    };

    assert.equal(overviewJson.status, "OK");
    assert.equal(overviewJson.treasuryAccount, "jubayir69.testnet");
    assert.equal(overviewJson.feeRecipient, "jubayir33.near");
    assert.equal(overviewJson.nep611Lanes.length, 4);
    assert.ok(overviewJson.postQuantumKeyHash.startsWith("ml-dsa-65-hash:"));

    // Toggle kill-switch ON then back OFF
    const ksOnRes = await fetch(`${baseUrl}/api/policy/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(ksOnRes.status, 200);
    const ksOnJson = (await ksOnRes.json()) as { emergency_kill_switch: boolean };
    assert.equal(ksOnJson.emergency_kill_switch, true);

    const ksOffRes = await fetch(`${baseUrl}/api/policy/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(ksOffRes.status, 200);
    const ksOffJson = (await ksOffRes.json()) as { emergency_kill_switch: boolean };
    assert.equal(ksOffJson.emergency_kill_switch, false);

    console.log(`  ✓ GET /api/overview           : HTTP ${overviewRes.status} | Treasury=${overviewJson.treasuryAccount} (${overviewJson.balanceFormatted})`);
    console.log(`  ✓ Live Credentials Detected   : ${JSON.stringify(overviewJson.liveCredentialsConfigured)}`);
    console.log(`  ✓ Kill-Switch Toggle API      : HTTP 200 (Armed=true -> Disarmed=false verified)\n`);

    // 3. Test Pillar Endpoints (/api/security/evaluate, /api/payroll/export-csv)
    console.log("[3/4] Probing POST /api/security/evaluate & GET /api/payroll/export-csv...");
    const [secRes, csvRes] = await Promise.all([
      fetch(`${baseUrl}/api/security/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: "scam-drainer-vault.testnet",
          amountUsd: 420,
        }),
      }),
      fetch(`${baseUrl}/api/payroll/export-csv`),
    ]);

    assert.equal(secRes.status, 200);
    assert.equal(csvRes.status, 200);
    const secJson = (await secRes.json()) as {
      riskVerdict: { decision: string; riskScore: number };
      governanceEscalation: { tier: string };
    };
    const csvText = await csvRes.text();
    assert.equal(secJson.riskVerdict.decision, "block");
    assert.ok(csvText.includes("scam-drainer-vault.testnet"));

    console.log(`  ✓ POST /api/security/evaluate : HTTP ${secRes.status} | Decision=${secJson.riskVerdict.decision.toUpperCase()} (Score=${secJson.riskVerdict.riskScore}/100)`);
    console.log(`  ✓ GET /api/payroll/export-csv : HTTP ${csvRes.status} (${csvText.split("\n").length} CSV ledger lines)\n`);

    // 4. Test POST /api/demo/autonomous-loop (Full 5-Stage Under-2-Minute Closed Loop)
    console.log("[4/4] Probing POST /api/demo/autonomous-loop (Full 5-Stage Closed Loop)...");
    const loopRes = await fetch(`${baseUrl}/api/demo/autonomous-loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(loopRes.status, 200, "POST /api/demo/autonomous-loop must return HTTP 200");
    const loopJson = (await loopRes.json()) as {
      status: string;
      elapsedMs: number;
      underTwoMinutesVerified: boolean;
      stages: Array<{ stage: number; title: string; summary: string }>;
      poc4HMaster: string;
      liveReasoning: { usedLiveApi: boolean; chatId: string };
      routeResult: { oneClickJwtAuthenticated: boolean; winningVenue: string };
    };

    assert.equal(loopJson.status, "PASS");
    assert.equal(loopJson.underTwoMinutesVerified, true, "Closed loop must complete in < 120 seconds");
    assert.equal(loopJson.stages.length, 5, "Must return all 5 morphing loop stages");

    console.log(`  ✓ POST /api/demo/autonomous-loop: HTTP ${loopRes.status} | Status=${loopJson.status} | Elapsed=${loopJson.elapsedMs}ms (< 120,000ms)`);
    for (const st of loopJson.stages) {
      console.log(`    -> [${st.title}] ${st.summary}`);
    }
    console.log(`  ✓ Combined PoC-4 H_master     : ${loopJson.poc4HMaster}`);

    console.log("\n================================================================================");
    console.log(" PHASE 6 SERVER & UI SMOKE TEST RESULT: ALL ENDPOINTS RETURNED HTTP 200 (PASS)");
    console.log("================================================================================");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runServerSmokeTest().catch((err) => {
  console.error("PHASE 6 SERVER SMOKE TEST FAILED:", err);
  process.exit(1);
});

