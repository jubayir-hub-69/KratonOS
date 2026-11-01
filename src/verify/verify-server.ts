import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type http from "node:http";
import { handleKratonHttpRequest } from "../server/server.js";

async function invokeServerEndpoint(
  method: "GET" | "POST",
  urlPath: string,
  bodyObj?: Record<string, unknown>
): Promise<{ statusCode: number; bodyText: string }> {
  const reqEmitter = new EventEmitter() as http.IncomingMessage;
  reqEmitter.method = method;
  reqEmitter.url = urlPath;
  reqEmitter.headers = { "content-type": "application/json" };

  let statusCode = 200;
  const responseChunks: Buffer[] = [];

  const resMock = {
    writeHead(code: number) {
      statusCode = code;
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
      }
    },
  } as unknown as http.ServerResponse;

  const handlerPromise = handleKratonHttpRequest(reqEmitter, resMock);

  setImmediate(() => {
    if (bodyObj) {
      reqEmitter.emit("data", Buffer.from(JSON.stringify(bodyObj), "utf8"));
    }
    reqEmitter.emit("end");
  });

  await handlerPromise;
  return {
    statusCode,
    bodyText: Buffer.concat(responseChunks).toString("utf8"),
  };
}

async function runServerSmokeTest(): Promise<void> {
  console.log("================================================================================");
  console.log(" KRATONOS PHASE 6 VERIFICATION: FULL-STACK SERVER & REACT SUPER-DAPP SMOKE TEST");
  console.log("================================================================================\n");

  // 1. Test Static UI Assets (HTML, CSS, JS)
  console.log("[1/4] Probing Compiled React + Tailwind + shadcn/ui Assets...");
  const [htmlRes, cssRes, jsRes] = await Promise.all([
    invokeServerEndpoint("GET", "/"),
    invokeServerEndpoint("GET", "/styles.css"),
    invokeServerEndpoint("GET", "/app.js"),
  ]);

  assert.equal(htmlRes.statusCode, 200, "GET / must return HTTP 200");
  assert.equal(cssRes.statusCode, 200, "GET /styles.css must return HTTP 200");
  assert.equal(jsRes.statusCode, 200, "GET /app.js must return HTTP 200");

  assert.ok(
    htmlRes.bodyText.includes("@hot-labs/near-connect"),
    "index.html must include @hot-labs/near-connect metadata"
  );
  assert.ok(
    htmlRes.bodyText.includes("Judge Verification Mode"),
    "index.html must include Judge Verification Mode metadata"
  );
  assert.ok(
    cssRes.bodyText.includes("font-variant-numeric: tabular-nums"),
    "styles.css must enforce tabular-nums"
  );
  assert.ok(
    jsRes.bodyText.includes("NearConnector"),
    "app.js must reference NearConnector"
  );

  console.log(
    `  ✓ GET / (index.html)          : HTTP ${htmlRes.statusCode} (${htmlRes.bodyText.length} bytes, @hot-labs/near-connect verified)`
  );
  console.log(
    `  ✓ GET /styles.css             : HTTP ${cssRes.statusCode} (${cssRes.bodyText.length} bytes, Light/Dark/System + tabular-nums)`
  );
  console.log(
    `  ✓ GET /app.js                 : HTTP ${jsRes.statusCode} (${jsRes.bodyText.length} bytes, React 19 + shadcn/ui Bridge)\n`
  );

  // 2. Test GET /api/overview & POST /api/policy/kill-switch
  console.log("[2/4] Probing GET /api/overview & POST /api/policy/kill-switch...");
  const overviewRes = await invokeServerEndpoint("GET", "/api/overview");
  assert.equal(overviewRes.statusCode, 200, "GET /api/overview must return HTTP 200");
  const overviewJson = JSON.parse(overviewRes.bodyText) as {
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

  const ksOnRes = await invokeServerEndpoint("POST", "/api/policy/kill-switch", {
    enabled: true,
  });
  assert.equal(ksOnRes.statusCode, 200);
  const ksOnJson = JSON.parse(ksOnRes.bodyText) as { emergency_kill_switch: boolean };
  assert.equal(ksOnJson.emergency_kill_switch, true);

  const ksOffRes = await invokeServerEndpoint("POST", "/api/policy/kill-switch", {
    enabled: false,
  });
  assert.equal(ksOffRes.statusCode, 200);
  const ksOffJson = JSON.parse(ksOffRes.bodyText) as { emergency_kill_switch: boolean };
  assert.equal(ksOffJson.emergency_kill_switch, false);

  console.log(
    `  ✓ GET /api/overview           : HTTP ${overviewRes.statusCode} | Treasury=${overviewJson.treasuryAccount} (${overviewJson.balanceFormatted})`
  );
  console.log(
    `  ✓ Live Credentials Detected   : ${JSON.stringify(overviewJson.liveCredentialsConfigured)}`
  );
  console.log(
    `  ✓ Kill-Switch Toggle API      : HTTP 200 (Armed=true -> Disarmed=false verified)\n`
  );

  // 3. Test Pillar Endpoints (/api/security/evaluate, /api/payroll/export-csv)
  console.log("[3/4] Probing POST /api/security/evaluate & GET /api/payroll/export-csv...");
  const [secRes, csvRes] = await Promise.all([
    invokeServerEndpoint("POST", "/api/security/evaluate", {
      receiverId: "scam-drainer-vault.testnet",
      amountUsd: 420,
    }),
    invokeServerEndpoint("GET", "/api/payroll/export-csv"),
  ]);

  assert.equal(secRes.statusCode, 200);
  assert.equal(csvRes.statusCode, 200);
  const secJson = JSON.parse(secRes.bodyText) as {
    riskVerdict: { decision: string; riskScore: number };
    governanceEscalation: { tier: string };
  };
  assert.equal(secJson.riskVerdict.decision, "block");
  assert.ok(csvRes.bodyText.includes("scam-drainer-vault.testnet"));

  console.log(
    `  ✓ POST /api/security/evaluate : HTTP ${secRes.statusCode} | Decision=${secJson.riskVerdict.decision.toUpperCase()} (Score=${secJson.riskVerdict.riskScore}/100)`
  );
  console.log(
    `  ✓ GET /api/payroll/export-csv : HTTP ${csvRes.statusCode} (${csvRes.bodyText.split("\n").length} CSV ledger lines)\n`
  );

  // 4. Test POST /api/demo/autonomous-loop
  console.log("[4/4] Probing POST /api/demo/autonomous-loop (Full 5-Stage Closed Loop)...");
  const loopRes = await invokeServerEndpoint("POST", "/api/demo/autonomous-loop", {});
  assert.equal(loopRes.statusCode, 200, "POST /api/demo/autonomous-loop must return HTTP 200");
  const loopJson = JSON.parse(loopRes.bodyText) as {
    status: string;
    elapsedMs: number;
    underTwoMinutesVerified: boolean;
    stages: Array<{ stage: number; title: string; summary: string }>;
    poc4HMaster: string;
  };

  assert.equal(loopJson.status, "PASS");
  assert.equal(loopJson.underTwoMinutesVerified, true);
  assert.equal(loopJson.stages.length, 5);

  console.log(
    `  ✓ POST /api/demo/autonomous-loop: HTTP ${loopRes.statusCode} | Status=${loopJson.status} | Elapsed=${loopJson.elapsedMs}ms (< 120,000ms)`
  );
  for (const st of loopJson.stages) {
    console.log(`    -> [${st.title}] ${st.summary}`);
  }
  console.log(`  ✓ Combined PoC-4 H_master     : ${loopJson.poc4HMaster}`);

  console.log("\n================================================================================");
  console.log(" PHASE 6 SERVER & UI SMOKE TEST RESULT: ALL ENDPOINTS RETURNED HTTP 200 (PASS)");
  console.log("================================================================================");
}

runServerSmokeTest().catch((err) => {
  console.error("PHASE 6 SERVER SMOKE TEST FAILED:", err);
  process.exit(1);
});
