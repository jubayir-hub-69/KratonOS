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

async function invokeRawServerEndpoint(
  method: "GET" | "POST",
  urlPath: string,
  rawBody: string
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
    reqEmitter.emit("data", Buffer.from(rawBody, "utf8"));
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

  // 1. Test Static UI Assets (HTML, /docs, CSS, JS)
  console.log("[1/4] Probing Compiled React + Tailwind + shadcn/ui Assets...");
  const [htmlRes, docsRes, cssRes, jsRes] = await Promise.all([
    invokeServerEndpoint("GET", "/"),
    invokeServerEndpoint("GET", "/docs"),
    invokeServerEndpoint("GET", "/styles.css"),
    invokeServerEndpoint("GET", "/app.js"),
  ]);

  assert.equal(htmlRes.statusCode, 200, "GET / must return HTTP 200");
  assert.equal(docsRes.statusCode, 200, "GET /docs must return HTTP 200");
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
  const overviewRes2 = await invokeServerEndpoint("GET", "/api/overview");
  assert.equal(overviewRes.statusCode, 200, "GET /api/overview must return HTTP 200");
  assert.equal(overviewRes2.statusCode, 200, "Second GET /api/overview must return HTTP 200");
  const overviewJson = JSON.parse(overviewRes.bodyText) as {
    status: string;
    treasuryAccount: string;
    feeRecipient: string;
    balanceFormatted: string;
    poc4MasterHash: string;
    postQuantumKeyHash: string;
    nep611Lanes: unknown[];
    mpcAddresses: Record<string, string>;
    oracle: {
      nearUsdMedian: number;
      ethUsdMedian: number;
      btcUsdMedian: number;
      solUsdMedian: number;
      xrpUsdMedian: number;
    };
    nearAiTee?: { liveApiUsed: boolean; attestationId: string };
    publicRpcAccessKeySummary?: {
      source: string;
      totalKeys: number;
      fullAccessCount: number;
      functionCallCount: number;
      redactedKeyPreviews: Array<{ publicKeyPreview: string }>;
    };
  };
  const overviewJson2 = JSON.parse(overviewRes2.bodyText) as { poc4MasterHash: string };

  assert.equal(overviewJson.status, "OK");
  assert.equal(overviewJson.treasuryAccount, "jubayir69.testnet");
  assert.equal(overviewJson.feeRecipient, "asma90.testnet");
  assert.equal(
    (overviewJson as Record<string, unknown>).spendableBalanceFormatted,
    "22.0184 NEAR",
    "GET /api/overview must return spendableBalanceFormatted === '22.0184 NEAR' (matching Meteor Wallet)"
  );
  assert.equal(
    overviewJson.balanceFormatted,
    "22.2202 NEAR",
    "GET /api/overview must return balanceFormatted === '22.2202 NEAR'"
  );
  assert.equal(overviewJson.nep611Lanes.length, 4);
  assert.ok(overviewJson.postQuantumKeyHash.startsWith("ml-dsa-65-hash:"));
  assert.equal(
    overviewJson.poc4MasterHash.length,
    64,
    "poc4MasterHash must be a canonical 64-char SHA-256 hex digest"
  );
  assert.equal(
    overviewJson.poc4MasterHash,
    overviewJson2.poc4MasterHash,
    "Consecutive GET /api/overview requests must return the exact same canonical poc4MasterHash"
  );
  assert.equal(
    "liveCredentialsConfigured" in (overviewJson as Record<string, unknown>),
    false,
    "Public GET /api/overview must NOT expose liveCredentialsConfigured"
  );
  assert.equal(
    "keyAudit" in (overviewJson as Record<string, unknown>),
    false,
    "Public GET /api/overview must NOT expose raw keyAudit"
  );
  assert.ok(
    overviewJson.publicRpcAccessKeySummary &&
      overviewJson.publicRpcAccessKeySummary.source.includes("view_access_key_list"),
    "GET /api/overview must expose redacted publicRpcAccessKeySummary from public RPC"
  );

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
    `  ✓ GET /api/overview           : HTTP ${overviewRes.statusCode} | Treasury=${overviewJson.treasuryAccount} (${overviewJson.balanceFormatted}) | H_master=${overviewJson.poc4MasterHash.slice(0, 16)}... | NEAR_AI_liveApiUsed=${String(overviewJson.nearAiTee?.liveApiUsed)}`
  );
  console.log(
    `  ✓ Public RPC Key Hygiene      : liveCredentialsConfigured=REDACTED | publicRpcKeys=${overviewJson.publicRpcAccessKeySummary?.totalKeys ?? 0} (truncated previews)`
  );
  console.log(
    `  ✓ Kill-Switch Toggle API      : HTTP 200 (Armed=true -> Disarmed=false verified)\n`
  );

  // 3. Test Pillar Endpoints (/api/security/evaluate, /api/payroll/export-csv, /api/payroll/export-statement, /llms.txt, /openapi.json, & Anti-Hallucination TEE Co-Pilot)
  console.log("[3/4] Probing Security, Printable Audit Statement, /llms.txt, /openapi.json & Anti-Hallucination TEE Co-Pilot...");
  const [secRes, csvRes, stmtRes, llmsRes, openApiRes, teeMarketRes, teeUnlistedRes, teeTypoRes] = await Promise.all([
    invokeServerEndpoint("POST", "/api/security/evaluate", {
      receiverId: "unverified-quarantine-row12.testnet",
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
  assert.ok(csvRes.bodyText.includes("unverified-quarantine-row12.testnet"));
  assert.ok(
    csvRes.bodyText.includes("0.00125 NEAR (1250000000000000000000 yocto)"),
    "CSV export must format storage deposit as 0.00125 NEAR (1250000000000000000000 yocto)"
  );
  assert.ok(stmtRes.bodyText.includes("Executive Bookkeeper Reconciliation Statement"));
  assert.ok(
    stmtRes.bodyText.includes("size: A4 landscape;"),
    "Printable statement must include A4 landscape single-page CSS"
  );
  assert.ok(
    stmtRes.bodyText.includes(overviewJson.poc4MasterHash),
    "GET /api/payroll/export-statement must carry the exact same poc4MasterHash as GET /api/overview"
  );
  assert.ok(
    csvRes.bodyText.includes(overviewJson.poc4MasterHash),
    "GET /api/payroll/export-csv must carry the exact same poc4MasterHash as GET /api/overview"
  );
  assert.ok(
    stmtRes.bodyText.includes("SETTLED (") &&
      stmtRes.bodyText.includes("block:") &&
      stmtRes.bodyText.includes("|receipt:") &&
      stmtRes.bodyText.includes("EnhR2L7eUkqBkrbZmAVgwYErUVhAHtaLXvRZeB9o4ayN") &&
      stmtRes.bodyText.includes("https://testnet.nearblocks.io/txns/") &&
      stmtRes.bodyText.includes("https://testnet.nearblocks.io/address/"),
    "Printable payroll statement must include real block/receipt commitments and clickable NEARBlocks batch anchor tx links"
  );
  assert.ok(
    Boolean((overviewJson as Record<string, unknown>).latestLiveProofReceipt),
    "GET /api/overview must always include a verified latestLiveProofReceipt (never null on cold start)"
  );
  const overviewRecord = overviewJson as Record<string, unknown>;
  const latestReceipt = overviewRecord.latestLiveProofReceipt as Record<string, unknown>;
  assert.equal(
    latestReceipt.policyHash,
    overviewRecord.policyHash,
    "latestLiveProofReceipt.policyHash must match top-level overview.policyHash 100%"
  );
  assert.equal(
    latestReceipt.poc4HMaster,
    overviewJson.poc4MasterHash,
    "latestLiveProofReceipt.poc4HMaster must match top-level overview.poc4MasterHash 100%"
  );
  assert.ok(
    Array.isArray(overviewRecord.recentOnChainTxns) &&
      (overviewRecord.recentOnChainTxns as unknown[]).length >= 3,
    "GET /api/overview recentOnChainTxns must never be empty"
  );
  assert.equal(
    overviewRecord.recentOnChainTxnsLive,
    true,
    "GET /api/overview recentOnChainTxnsLive must be true"
  );
  assert.ok(
    overviewJson.mpcAddresses.bitcoinSegwitAddress.startsWith("tb1q"),
    "MPC Bitcoin Testnet address must use tb1q SegWit Bech32 prefix"
  );
  assert.equal(
    (overviewJson.nearAiTee as Record<string, unknown>)?.signingAddress,
    "0xb98a789cdc4817275f5155593ba73ef2a957e779",
    "nearAiTee.signingAddress must be normalized lowercase 0xb98a789cdc4817275f5155593ba73ef2a957e779"
  );
  assert.equal(
    stmtRes.bodyText.includes("CwyjzR6A9Y"),
    false,
    "Printable audit statement must never contain simulated CwyjzR6A9Y tx hash"
  );

  // Verify 3-Tier Earned-Trust Governance on POST /api/security/evaluate ($45 AUTO_APPROVE vs $85 ONE_COUNCIL_FAST_TRACK vs $250 SPUTNIK_DAO_PROPOSAL)
  const [safeTier1Res, fastTrackTier2Res, daoTier3Res] = await Promise.all([
    invokeServerEndpoint("POST", "/api/security/evaluate", {
      receiverId: "alice-dev.testnet",
      amountUsd: 45,
    }),
    invokeServerEndpoint("POST", "/api/security/evaluate", {
      receiverId: "alice-dev.testnet",
      amountUsd: 85,
    }),
    invokeServerEndpoint("POST", "/api/security/evaluate", {
      receiverId: "alice-dev.testnet",
      amountUsd: 250,
    }),
  ]);
  const safeTier1Json = JSON.parse(safeTier1Res.bodyText) as {
    riskVerdict: { decision: string };
    governanceEscalation: { tier: string };
  };
  const fastTrackTier2Json = JSON.parse(fastTrackTier2Res.bodyText) as {
    riskVerdict: { decision: string };
    governanceEscalation: { tier: string };
  };
  const daoTier3Json = JSON.parse(daoTier3Res.bodyText) as {
    riskVerdict: { decision: string };
    governanceEscalation: { tier: string };
  };
  assert.equal(safeTier1Json.riskVerdict.decision, "allow", "$45 safe receiver must return decision === allow");
  assert.equal(safeTier1Json.governanceEscalation.tier, "AUTO_APPROVE", "$45 safe receiver must return tier === AUTO_APPROVE");
  assert.equal(fastTrackTier2Json.riskVerdict.decision, "warn", "$85 receiver must return decision === warn (Tier 2)");
  assert.equal(fastTrackTier2Json.governanceEscalation.tier, "ONE_COUNCIL_FAST_TRACK", "$85 receiver must return tier === ONE_COUNCIL_FAST_TRACK");
  assert.equal(daoTier3Json.governanceEscalation.tier, "SPUTNIK_DAO_PROPOSAL", "$250 receiver must escalate to tier === SPUTNIK_DAO_PROPOSAL");
  assert.ok(llmsRes.bodyText.includes("# KratonOS"));
  assert.ok(llmsRes.bodyText.includes("https://nearhackathon.com/HACKATHON.md"));
  assert.ok(
    llmsRes.bodyText.includes("09-games.md") && llmsRes.bodyText.includes("13-open.md"),
    "/llms.txt must list all 13 official hackathon track prompt specifications (01-13)"
  );

  const routerPriceSyncRes = await invokeServerEndpoint("POST", "/api/router/quote", {
    originSymbol: "wNEAR",
    destinationSymbol: "USDC",
    amountInHuman: 10,
  });
  assert.equal(routerPriceSyncRes.statusCode, 200, "POST /api/router/quote (wNEAR->USDC) must return HTTP 200");
  const routerPriceSyncJson = JSON.parse(routerPriceSyncRes.bodyText) as {
    limitOrder: { requestEnvelope: { data: { attributes: { price: string } } } };
  };
  assert.equal(
    routerPriceSyncJson.limitOrder.requestEnvelope.data.attributes.price,
    "3.715",
    "Router quote wNEAR limit price must be deterministic '3.715' (25 x 3.715 = 92.8750 USDC)"
  );
  assert.ok(llmsRes.bodyText.includes("https://docs.near.org/"));
  assert.ok(llmsRes.bodyText.includes("https://trezu.org/"));
  assert.ok(
    llmsRes.bodyText.includes("/api/wallet/balances"),
    "/llms.txt must document POST /api/wallet/balances"
  );
  assert.ok(
    llmsRes.bodyText.includes("Q-015") &&
      llmsRes.bodyText.includes("https://github.com/jubayir-hub-69/arrive-near"),
    "/llms.txt must include Rule Q-015 cross-repository disclosure for arrive-near"
  );

  const openApiJson = JSON.parse(openApiRes.bodyText) as {
    openapi: string;
    info: { version: string };
    paths: Record<string, unknown>;
  };
  assert.equal(openApiJson.openapi, "3.1.0");
  assert.equal(openApiJson.info.version, "2026.6", "/openapi.json info.version must be 2026.6");
  assert.ok(openApiJson.paths["/api/payroll/export-statement"]);
  assert.ok(
    openApiJson.paths["/api/wallet/balances"],
    "/openapi.json must document POST /api/wallet/balances"
  );
  assert.ok(
    openApiJson.paths["/api/onchain/receipt"],
    "/openapi.json must document GET /api/onchain/receipt"
  );
  assert.equal(
    Object.keys(openApiJson.paths).length,
    13,
    "/openapi.json must register all 13 REST API endpoints"
  );

  const receiptInspectorRes = await invokeServerEndpoint(
    "GET",
    "/api/onchain/receipt?txHash=EnhR2L7eUkqBkrbZmAVgwYErUVhAHtaLXvRZeB9o4ayN"
  );
  assert.equal(receiptInspectorRes.statusCode, 200, "GET /api/onchain/receipt must return HTTP 200");
  const receiptInspectorJson = JSON.parse(receiptInspectorRes.bodyText) as {
    txHash: string;
    depositNear: string;
    receiverId: string;
    executionStatus: string;
  };
  assert.equal(receiptInspectorJson.txHash, "EnhR2L7eUkqBkrbZmAVgwYErUVhAHtaLXvRZeB9o4ayN");
  assert.equal(receiptInspectorJson.receiverId, "asma90.testnet");
  assert.equal(receiptInspectorJson.depositNear, "0.45 NEAR");
  assert.equal(receiptInspectorJson.executionStatus, "EXECUTED_OPTIMISTIC / SUCCESS_VALUE");

  // Input validation & HTTP 400 boundary checks (malformed JSON, unlisted token, identical swap, invalid EVM address)
  const [badJsonRes, unlistedQuoteRes, sameAssetQuoteRes, badEvmWalletRes] = await Promise.all([
    invokeRawServerEndpoint("POST", "/api/policy/kill-switch", "{malformed_json"),
    invokeServerEndpoint("POST", "/api/router/quote", {
      originSymbol: "AYAN",
      destinationSymbol: "USDT",
      amountInHuman: 100,
    }),
    invokeServerEndpoint("POST", "/api/router/quote", {
      originSymbol: "wNEAR",
      destinationSymbol: "wNEAR",
      amountInHuman: 100,
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "not-a-valid-0x-address",
      chainType: "evm",
    }),
  ]);
  assert.equal(badJsonRes.statusCode, 400, "Malformed JSON body must return HTTP 400 (never 500)");
  assert.equal(unlistedQuoteRes.statusCode, 400, "Unlisted router token must return HTTP 400");
  assert.equal(sameAssetQuoteRes.statusCode, 400, "Identical origin/destination asset must return HTTP 400");
  assert.equal(badEvmWalletRes.statusCode, 400, "Invalid EVM address on /api/wallet/balances must return HTTP 400");

  const teeMarketJson = JSON.parse(teeMarketRes.bodyText) as {
    liveApiUsed?: boolean;
    liveReasoning: { usedLiveApi: boolean; chatId: string; content: string };
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
  assert.equal(
    teeTypoJson.oracleSnap.dynamicAssetQuotes.length,
    1,
    "Strict Requested-Token Filtering: AVEX/USDT prompt must return strictly 1 requested asset"
  );

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

  // 3H. Test POST /api/wallet/balances (Mode B Testnet-Only Probes + Mainnet-Mismatch Guards per Rule Q-010)
  const [
    nearBalRes,
    evmBalRes,
    solBalRes,
    suiBalRes,
    btcBalRes,
    nearMainnetGuardRes,
    evmMainnetGuardRes,
    btcMainnetGuardRes,
    suiMainnetGuardRes,
    tonMainnetGuardRes,
  ] = await Promise.all([
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "jubayir69.testnet",
      chainType: "near",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      chainIdHex: "0xaa36a7",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "11111111111111111111111111111111",
      chainType: "solana",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "0x0000000000000000000000000000000000000000000000000000000000000002",
      chainType: "sui",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      chainType: "bitcoin",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "jubayir33.near",
      chainType: "near",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      chainIdHex: "0x1",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      chainType: "bitcoin",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "0x0000000000000000000000000000000000000000000000000000000000000002",
      chainType: "sui",
      chainIdHex: "sui:mainnet",
    }),
    invokeServerEndpoint("POST", "/api/wallet/balances", {
      address: "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
      chainType: "ton",
    }),
  ]);
  assert.equal(nearBalRes.statusCode, 200, "POST /api/wallet/balances (NEAR) must return HTTP 200");
  assert.equal(evmBalRes.statusCode, 200, "POST /api/wallet/balances (EVM) must return HTTP 200");
  assert.equal(solBalRes.statusCode, 200, "POST /api/wallet/balances (Solana) must return HTTP 200");
  assert.equal(suiBalRes.statusCode, 200, "POST /api/wallet/balances (Sui) must return HTTP 200");
  assert.equal(btcBalRes.statusCode, 200, "POST /api/wallet/balances (Bitcoin) must return HTTP 200");
  assert.equal(nearMainnetGuardRes.statusCode, 200, "NEAR Mainnet mismatch probe must return HTTP 200");
  assert.equal(evmMainnetGuardRes.statusCode, 200, "EVM Mainnet mismatch probe must return HTTP 200");
  assert.equal(btcMainnetGuardRes.statusCode, 200, "Bitcoin Mainnet mismatch probe must return HTTP 200");
  assert.equal(suiMainnetGuardRes.statusCode, 200, "Sui Mainnet mismatch probe must return HTTP 200");
  assert.equal(tonMainnetGuardRes.statusCode, 200, "TON Mainnet mismatch probe must return HTTP 200");

  interface WalletBalancesResponsePayload {
    status: string;
    chainType: string;
    address: string;
    detectedNetwork?: string;
    isMainnetMismatch?: boolean;
    networkMismatchReason?: string;
    nativeSymbol: string;
    nativeBalance: number;
    wnearBalance: number;
    usdcBalance: number;
    usdtBalance: number;
    tokenBalances: Record<string, number>;
    liveRpcVerified: boolean;
  }

  const nearBalJson = JSON.parse(nearBalRes.bodyText) as WalletBalancesResponsePayload;
  const evmBalJson = JSON.parse(evmBalRes.bodyText) as WalletBalancesResponsePayload;
  const solBalJson = JSON.parse(solBalRes.bodyText) as WalletBalancesResponsePayload;
  const suiBalJson = JSON.parse(suiBalRes.bodyText) as WalletBalancesResponsePayload;
  const btcBalJson = JSON.parse(btcBalRes.bodyText) as WalletBalancesResponsePayload;

  const nearMainnetJson = JSON.parse(nearMainnetGuardRes.bodyText) as WalletBalancesResponsePayload;
  const evmMainnetJson = JSON.parse(evmMainnetGuardRes.bodyText) as WalletBalancesResponsePayload;
  const btcMainnetJson = JSON.parse(btcMainnetGuardRes.bodyText) as WalletBalancesResponsePayload;
  const suiMainnetJson = JSON.parse(suiMainnetGuardRes.bodyText) as WalletBalancesResponsePayload;
  const tonMainnetJson = JSON.parse(tonMainnetGuardRes.bodyText) as WalletBalancesResponsePayload;

  assert.equal(nearBalJson.status, "OK");
  assert.equal(nearBalJson.chainType, "near");
  assert.equal(nearBalJson.nativeSymbol, "NEAR");
  assert.equal(nearBalJson.isMainnetMismatch, false, "jubayir69.testnet must have isMainnetMismatch === false");
  assert.equal(nearBalJson.detectedNetwork, "NEAR Testnet");
  assert.ok(typeof nearBalJson.nativeBalance === "number" && nearBalJson.nativeBalance >= 0);
  assert.ok(typeof nearBalJson.usdcBalance === "number" && nearBalJson.usdcBalance >= 0);
  assert.ok(typeof nearBalJson.usdtBalance === "number" && nearBalJson.usdtBalance >= 0);
  assert.equal(typeof nearBalJson.liveRpcVerified, "boolean");

  assert.equal(evmBalJson.status, "OK");
  assert.equal(evmBalJson.chainType, "evm");
  assert.equal(evmBalJson.nativeSymbol, "ETH");
  assert.equal(evmBalJson.isMainnetMismatch, false, "EVM Sepolia (0xaa36a7) must have isMainnetMismatch === false");
  assert.ok(typeof evmBalJson.nativeBalance === "number" && evmBalJson.nativeBalance >= 0);
  assert.ok(typeof evmBalJson.usdcBalance === "number" && evmBalJson.usdcBalance >= 0);
  assert.ok(typeof evmBalJson.usdtBalance === "number" && evmBalJson.usdtBalance >= 0);
  assert.equal(typeof evmBalJson.liveRpcVerified, "boolean");

  assert.equal(solBalJson.status, "OK");
  assert.equal(solBalJson.chainType, "solana");
  assert.equal(solBalJson.nativeSymbol, "SOL");
  assert.equal(solBalJson.isMainnetMismatch, false);
  assert.ok(
    solBalJson.detectedNetwork === "Solana Testnet" || solBalJson.detectedNetwork === "Solana Devnet",
    `Solana balance query must use Testnet/Devnet only, got ${String(solBalJson.detectedNetwork)}`
  );
  assert.ok(typeof solBalJson.nativeBalance === "number" && solBalJson.nativeBalance >= 0);
  assert.equal(typeof solBalJson.liveRpcVerified, "boolean");

  assert.equal(suiBalJson.status, "OK");
  assert.equal(suiBalJson.chainType, "sui");
  assert.equal(suiBalJson.nativeSymbol, "SUI");
  assert.equal(suiBalJson.isMainnetMismatch, false);
  assert.equal(suiBalJson.detectedNetwork, "Sui Testnet");
  assert.ok(typeof suiBalJson.nativeBalance === "number" && suiBalJson.nativeBalance >= 0);
  assert.equal(typeof suiBalJson.liveRpcVerified, "boolean");

  assert.equal(btcBalJson.status, "OK");
  assert.equal(btcBalJson.chainType, "bitcoin");
  assert.equal(btcBalJson.nativeSymbol, "BTC");
  assert.equal(btcBalJson.isMainnetMismatch, false);
  assert.equal(btcBalJson.detectedNetwork, "Bitcoin Testnet");
  assert.ok(typeof btcBalJson.nativeBalance === "number" && btcBalJson.nativeBalance >= 0);
  assert.equal(typeof btcBalJson.liveRpcVerified, "boolean");

  // Verify Mainnet-Mismatch Guards (Rule Q-010: Never expose Mainnet balances & prompt switch to Testnet mode)
  assert.equal(nearMainnetJson.isMainnetMismatch, true, ".near Mainnet account must trigger isMainnetMismatch === true");
  assert.equal(nearMainnetJson.nativeBalance, 0, ".near Mainnet account must return 0 balance without querying Mainnet");
  assert.ok(
    nearMainnetJson.networkMismatchReason?.includes("Testnet mode"),
    ".near Mainnet mismatch must prompt switching to Testnet mode"
  );

  assert.equal(evmMainnetJson.isMainnetMismatch, true, "EVM 0x1 Mainnet must trigger isMainnetMismatch === true");
  assert.ok(
    evmMainnetJson.networkMismatchReason?.includes("Testnet mode"),
    "EVM Mainnet mismatch must prompt switching to Testnet mode"
  );

  assert.equal(btcMainnetJson.isMainnetMismatch, true, "bc1... Mainnet Bitcoin must trigger isMainnetMismatch === true");
  assert.equal(btcMainnetJson.nativeBalance, 0, "bc1... Mainnet Bitcoin must return 0 without querying Mainnet");
  assert.ok(
    btcMainnetJson.networkMismatchReason?.includes("Bitcoin Testnet mode"),
    "Bitcoin Mainnet mismatch must prompt switching to Bitcoin Testnet mode"
  );

  assert.equal(suiMainnetJson.isMainnetMismatch, true, "Sui Mainnet must trigger isMainnetMismatch === true");
  assert.ok(
    suiMainnetJson.networkMismatchReason?.includes("Sui Testnet mode"),
    "Sui Mainnet mismatch must prompt switching Slush / Sui Wallet to Sui Testnet mode"
  );

  assert.equal(tonMainnetJson.isMainnetMismatch, true, "EQ... Mainnet TON must trigger isMainnetMismatch === true");
  assert.equal(tonMainnetJson.nativeBalance, 0, "EQ... Mainnet TON must return 0 without querying Mainnet");
  assert.ok(
    tonMainnetJson.networkMismatchReason?.includes("Testnet mode"),
    "TON Mainnet mismatch must prompt switching to Testnet mode"
  );

  // 3I. Test Sub-Cent 8-Decimal Precision (PEPE/USDT) & Market Revenue Split Alignment ($2.50)
  const [teePepeRes, marketExecRes] = await Promise.all([
    invokeServerEndpoint("POST", "/api/tee/verify", {
      prompt: "PEPE/USDT CURRENT MARKET PRICE",
    }),
    invokeServerEndpoint("POST", "/api/market/execute", {
      query: "research",
      quotedAmountUsd: 4.2,
      plannedBudgetUsd: 2.5,
    }),
  ]);
  assert.equal(teePepeRes.statusCode, 200, "POST /api/tee/verify (PEPE/USDT) must return HTTP 200");
  assert.equal(marketExecRes.statusCode, 200, "POST /api/market/execute must return HTTP 200");

  const teePepeJson = JSON.parse(teePepeRes.bodyText) as {
    liveReasoning: { content: string };
    oracleSnap: {
      dynamicAssetQuotes: Array<{ symbol: string; found: boolean; priceUsd: number | null }>;
    };
  };
  const pepeQuote = teePepeJson.oracleSnap.dynamicAssetQuotes.find((q) => q.symbol === "PEPE");
  assert.ok(pepeQuote && pepeQuote.found, "PEPE must be found on first click");
  assert.ok(
    typeof pepeQuote.priceUsd === "number" && pepeQuote.priceUsd > 0 && pepeQuote.priceUsd < 0.001,
    `PEPE priceUsd must preserve sub-cent value (> 0 and < 0.001), got ${String(pepeQuote.priceUsd)}`
  );
  assert.ok(
    !teePepeJson.liveReasoning.content.includes("$0.000000") &&
      !teePepeJson.liveReasoning.content.includes("$0.0000 USD"),
    "PEPE/USDT report must format sub-cent price with 8 decimals (never $0.000000)"
  );

  const marketExecJson = JSON.parse(marketExecRes.bodyText) as {
    negotiation: { finalAgreedPriceUsd: number };
    revenueSplit: { grossRevenueUsd: number; netRevenueUsd: number };
    swarmRound: {
      clearedVolumeUnits: number;
      totalSwarmSavingsUsd: number;
      buyerAllocations: Array<{ allocatedUnits: number; netSavingsUsd: number }>;
    };
  };
  assert.equal(
    marketExecJson.revenueSplit.grossRevenueUsd,
    marketExecJson.negotiation.finalAgreedPriceUsd,
    "POST /api/market/execute revenueSplit.grossRevenueUsd must equal negotiation.finalAgreedPriceUsd ($2.50)"
  );
  assert.equal(
    marketExecJson.swarmRound.buyerAllocations.length,
    20,
    "Swarm coordinator must return all 20 buyer allocation rows"
  );
  const sumUnits = marketExecJson.swarmRound.buyerAllocations.reduce(
    (acc, r) => acc + r.allocatedUnits,
    0
  );
  assert.equal(sumUnits, 510, "20-row Swarm buyer allocations must sum to 510 units");
  assert.equal(
    marketExecJson.swarmRound.totalSwarmSavingsUsd,
    357,
    "20-row Swarm totalSwarmSavingsUsd must equal $357.00"
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
    `  ✓ POST /api/tee/verify (5-Asset): liveApiUsed=${String(teeMarketJson.liveReasoning.usedLiveApi)} | chatId=${teeMarketJson.liveReasoning.chatId} | ETH=$${teeMarketJson.oracleSnap.ethUsdMedian.toFixed(2)}, NEAR=$${teeMarketJson.oracleSnap.nearUsdMedian.toFixed(2)}, XRP=$${teeMarketJson.oracleSnap.xrpUsdMedian.toFixed(4)}, SOL=$${teeMarketJson.oracleSnap.solUsdMedian.toFixed(2)}, BTC=$${teeMarketJson.oracleSnap.btcUsdMedian.toFixed(0)}`
  );
  console.log(
    `  ✓ Anti-Hallucination Oracle   : AYAN/USDT -> ${ayanQuote.status} (priceUsd=${String(ayanQuote.priceUsd)}) | AVEX/USDT -> Did you mean ${avexQuote.suggestion} ($${avexQuote.suggestionPriceUsd?.toFixed(2)})?`
  );
  console.log(
    `  ✓ POST /api/wallet/balances   : HTTP 200 | NEAR=${nearBalJson.nativeBalance.toFixed(4)} NEAR | EVM=${evmBalJson.nativeBalance.toFixed(4)} ETH | SOL=${solBalJson.nativeBalance.toFixed(4)} SOL | SUI=${suiBalJson.nativeBalance.toFixed(4)} SUI | BTC=${btcBalJson.nativeBalance.toFixed(6)} BTC`
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
  assert.equal(
    loopJson.poc4HMaster,
    "a9ada695b7f0859fe205c64a7f246b4851d82526002778ece337338e20ffb152",
    "POST /api/demo/autonomous-loop must preserve canonical poc4HMaster a9ada695b7f0859fe205c64a7f246b4851d82526002778ece337338e20ffb152"
  );

  const [postLoopOverviewRes, postLoopStmtRes] = await Promise.all([
    invokeServerEndpoint("GET", "/api/overview"),
    invokeServerEndpoint("GET", "/api/payroll/export-statement"),
  ]);
  const postLoopOverviewJson = JSON.parse(postLoopOverviewRes.bodyText) as { poc4MasterHash: string };
  assert.equal(
    postLoopOverviewJson.poc4MasterHash,
    loopJson.poc4HMaster,
    "GET /api/overview must immediately sync to the new loop poc4HMaster"
  );
  assert.ok(
    postLoopStmtRes.bodyText.includes(loopJson.poc4HMaster),
    "GET /api/payroll/export-statement must immediately sync to the new loop poc4HMaster"
  );

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
