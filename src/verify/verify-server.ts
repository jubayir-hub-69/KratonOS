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

  // 3. Test Pillar Endpoints (/api/security/evaluate, /api/payroll/export-csv, /api/payroll/export-statement, /llms.txt, /openapi.json, & Anti-Hallucination TEE Co-Pilot)
  console.log("[3/4] Probing Security, Printable Audit Statement, /llms.txt, /openapi.json & Anti-Hallucination TEE Co-Pilot...");
  const [secRes, csvRes, stmtRes, llmsRes, openApiRes, teeMarketRes, teeUnlistedRes, teeTypoRes] = await Promise.all([
    invokeServerEndpoint("POST", "/api/security/evaluate", {
      receiverId: "scam-drainer-vault.testnet",
      amountUsd: 420,
    }),
    invokeServerEndpoint("GET", "/api/payroll/export-csv"),
    invokeServerEndpoint("GET", "/api/payroll/export-statement"),
    invokeServerEndpoint("GET", "/llms.txt"),
    invokeServerEndpoint("GET", "/openapi.json"),
    invokeServerEndpoint("POST", "/api/tee/verify", {
      prompt: "NEAR/USDT, XRP /USDT CURRENT MARKET PRICE. Besides that, share some of today's crypto news as well.",
    }),
    invokeServerEndpoint("POST", "/api/tee/verify", {
      prompt: "AYAN/USDT PRICE",
    }),
    invokeServerEndpoint("POST", "/api/tee/verify", {
      prompt: "AVEX/USDT PRICE",
    }),
  ]);

  assert.equal(secRes.statusCode, 200);
  assert.equal(csvRes.statusCode, 200);
  assert.equal(stmtRes.statusCode, 200);
  assert.equal(llmsRes.statusCode, 200);
  assert.equal(openApiRes.statusCode, 200);
  assert.equal(teeMarketRes.statusCode, 200);
  assert.equal(teeUnlistedRes.statusCode, 200);
  assert.equal(teeTypoRes.statusCode, 200);

  const secJson = JSON.parse(secRes.bodyText) as {
    riskVerdict: { decision: string; riskScore: number };
    governanceEscalation: { tier: string };
  };
  assert.equal(secJson.riskVerdict.decision, "block");
  assert.ok(csvRes.bodyText.includes("scam-drainer-vault.testnet"));
  assert.ok(stmtRes.bodyText.includes("Executive Bookkeeper Reconciliation Statement"));
  assert.ok(llmsRes.bodyText.includes("# KratonOS"));

  const openApiJson = JSON.parse(openApiRes.bodyText) as { openapi: string; paths: Record<string, unknown> };
  assert.equal(openApiJson.openapi, "3.1.0");
  assert.ok(openApiJson.paths["/api/payroll/export-statement"]);

  const teeMarketJson = JSON.parse(teeMarketRes.bodyText) as {
    liveReasoning: { content: string };
    oracleSnap: {
      ethUsdMedian: number;
      nearUsdMedian: number;
      solUsdMedian: number;
      btcUsdMedian: number;
      xrpUsdMedian: number;
    };
  };
  assert.ok(teeMarketJson.oracleSnap.solUsdMedian > 0, "solUsdMedian must be > 0");
  assert.ok(teeMarketJson.oracleSnap.btcUsdMedian > 0, "btcUsdMedian must be > 0");
  assert.ok(teeMarketJson.oracleSnap.xrpUsdMedian > 0, "xrpUsdMedian must be > 0");
  assert.ok(
    !teeMarketJson.liveReasoning.content.includes("Enclave evaluated custom directive") &&
      !/not available/i.test(teeMarketJson.liveReasoning.content),
    "TEE Co-Pilot must answer NEAR/USDT & XRP/USDT market/news query directly with real live prices"
  );

  // Verify Anti-Hallucination on Unlisted Token (AYAN/USDT -> found: false, priceUsd: null, never $1.00)
  const teeUnlistedJson = JSON.parse(teeUnlistedRes.bodyText) as {
    liveReasoning: { content: string };
    oracleSnap: {
      dynamicAssetQuotes: Array<{
        symbol: string;
        found: boolean;
        priceUsd: number | null;
        status: string;
      }>;
    };
  };
  const ayanQuote = teeUnlistedJson.oracleSnap.dynamicAssetQuotes.find((q) => q.symbol === "AYAN");
  assert.ok(ayanQuote, "AYAN quote entry must exist in dynamicAssetQuotes");
  assert.equal(ayanQuote.found, false, "AYAN must have found === false");
  assert.equal(ayanQuote.priceUsd, null, "AYAN must have priceUsd === null (never fake $1.00)");
  assert.equal(ayanQuote.status, "UNLISTED_TOKEN", "AYAN must have status === UNLISTED_TOKEN");
  assert.ok(
    teeUnlistedJson.liveReasoning.content.includes("TOKEN NOT FOUND (UNLISTED)"),
    "TEE Co-Pilot must explicitly report TOKEN NOT FOUND (UNLISTED) for AYAN"
  );

  // Verify Anti-Hallucination + Levenshtein Typo Suggestion on Misspelled Token (AVEX/USDT -> suggestion: AVAX)
  const teeTypoJson = JSON.parse(teeTypoRes.bodyText) as {
    liveReasoning: { content: string };
    oracleSnap: {
      dynamicAssetQuotes: Array<{
        symbol: string;
        found: boolean;
        priceUsd: number | null;
        status: string;
        suggestion?: string;
        suggestionPriceUsd?: number;
      }>;
    };
  };
  const avexQuote = teeTypoJson.oracleSnap.dynamicAssetQuotes.find((q) => q.symbol === "AVEX");
  assert.ok(avexQuote, "AVEX quote entry must exist in dynamicAssetQuotes");
  assert.equal(avexQuote.found, false, "AVEX must have found === false");
  assert.equal(avexQuote.priceUsd, null, "AVEX must have priceUsd === null");
  assert.equal(avexQuote.suggestion, "AVAX", "AVEX must suggest AVAX via Levenshtein/typo detection");
  assert.ok((avexQuote.suggestionPriceUsd ?? 0) > 0, "AVEX suggestionPriceUsd for AVAX must be > 0");

  // 3G. Test POST /api/onchain/commit-proof (Live NEAR Testnet Proof Signer)
  const proofRes = await invokeServerEndpoint("POST", "/api/onchain/commit-proof", {});
  assert.equal(proofRes.statusCode, 200, "POST /api/onchain/commit-proof must return HTTP 200");
  const proofJson = JSON.parse(proofRes.bodyText) as {
    status: string;
    txHash: string;
    signerAccountId: string;
    signerPublicKey: string;
    blockHeight: number;
    blockHash: string;
    poc4HMaster: string;
    ed25519Verified: boolean;
    explorerTxUrl: string;
    explorerAccountUrl: string;
  };
  assert.ok(
    proofJson.status === "COMMITTED_ON_CHAIN" ||
      proofJson.status === "CRYPTOGRAPHICALLY_SIGNED_PROOF",
    `Unexpected proof commit status: ${proofJson.status}`
  );
  assert.equal(proofJson.signerAccountId, "jubayir69.testnet");
  assert.equal(proofJson.ed25519Verified, true, "Ed25519 signature on Borsh tx digest must verify");
  assert.ok(
    proofJson.explorerTxUrl.startsWith("https://testnet.nearblocks.io/txns/"),
    "explorerTxUrl must point to NEARBlocks testnet txns"
  );
  assert.equal(
    proofJson.explorerAccountUrl,
    "https://testnet.nearblocks.io/address/jubayir69.testnet"
  );

  console.log(
    `  ✓ POST /api/security/evaluate : HTTP ${secRes.statusCode} | Decision=${secJson.riskVerdict.decision.toUpperCase()} (Score=${secJson.riskVerdict.riskScore}/100)`
  );
  console.log(
    `  ✓ GET /api/payroll/export-csv : HTTP ${csvRes.statusCode} (${csvRes.bodyText.split("\n").length} CSV ledger lines, UTF-8 BOM)`
  );
  console.log(
    `  ✓ GET /api/payroll/export-statement: HTTP ${stmtRes.statusCode} (${stmtRes.bodyText.length} bytes Printable HTML/PDF Audit Statement)`
  );
  console.log(
    `  ✓ GET /llms.txt & /openapi.json: HTTP 200 (OpenAPI ${openApiJson.openapi}, ${Object.keys(openApiJson.paths).length} paths documented)`
  );
  console.log(
    `  ✓ POST /api/tee/verify (5-Asset): ETH=$${teeMarketJson.oracleSnap.ethUsdMedian.toFixed(2)}, NEAR=$${teeMarketJson.oracleSnap.nearUsdMedian.toFixed(2)}, XRP=$${teeMarketJson.oracleSnap.xrpUsdMedian.toFixed(4)}, SOL=$${teeMarketJson.oracleSnap.solUsdMedian.toFixed(2)}, BTC=$${teeMarketJson.oracleSnap.btcUsdMedian.toFixed(0)}`
  );
  console.log(
    `  ✓ Anti-Hallucination Oracle   : AYAN/USDT -> ${ayanQuote.status} (priceUsd=${String(ayanQuote.priceUsd)}) | AVEX/USDT -> Did you mean ${avexQuote.suggestion} ($${avexQuote.suggestionPriceUsd?.toFixed(2)})?`
  );
  console.log(
    `  ✓ POST /api/onchain/commit-proof: HTTP ${proofRes.statusCode} | TxHash=${proofJson.txHash.slice(0, 16)}... | Ed25519=${String(proofJson.ed25519Verified)} | ${proofJson.explorerTxUrl}\n`
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
