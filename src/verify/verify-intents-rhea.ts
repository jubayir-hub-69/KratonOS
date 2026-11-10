import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildAndSignOffChainIntent,
  buildPartnerAnyInputSweepQuote,
  createConfidentialLimitOrder,
  fetchLiveOneClickTokens,
  fetchOneClickExplorerTelemetry,
  findOptimalTriVenueRoute,
  parseConfidentialOneClickStatus,
} from "../core/intents-rhea-router.js";
import { executeLiveTeeReasoning } from "../core/near-ai-tee.js";
import {
  execute_ceil_exact_output_invoice,
  executeFaultIsolatedBatchPayroll,
} from "../core/payroll-and-invoicing.js";
import {
  deriveMpcMultiChainAddresses,
  scanAndHarvestRheaFarms,
} from "../core/rhea-yield-and-mpc.js";

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log(" KRATONOS PHASE 5 VERIFICATION: PILLAR 3 & PILLAR 4 FINANCIAL EXECUTION ENGINE");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // CHECK 1: Live 1Click Mainnet Token Registry & Tri-Venue Smart Router
  // --------------------------------------------------------------------------
  console.log("[1/4] Testing Live 1Click Token Registry (/v0/tokens) & Tri-Venue Smart Router...");
  const [tokenRegistry, explorerTelemetry] = await Promise.all([
    fetchLiveOneClickTokens(),
    fetchOneClickExplorerTelemetry(),
  ]);
  assert.ok(tokenRegistry.tokens.length >= 4, "1Click token registry must return tokens");
  assert.ok(explorerTelemetry.indexedCrossChainBlockchainsCount >= 1);

  const routeResult = await findOptimalTriVenueRoute({
    originSymbol: "USDC",
    destinationSymbol: "USDT",
    amountInHuman: 100,
  });

  assert.equal(
    routeResult.winningVenue,
    "ONECLICK_CONFIDENTIAL_INTENTS",
    "1Click Confidential Intents must win 1-bp stablecoin USDC -> USDT route"
  );
  assert.equal(routeResult.feeRecipient, "asma90.testnet", "Protocol fee recipient must be asma90.testnet");
  assert.equal(routeResult.winningCandidate.appFeeBps, 40, "App fee must be 40 bps");
  assert.equal(routeResult.winningCandidate.protocolFeeBps, 1, "Stablecoin protocol fee must be 1 bp (0.01%)");
  assert.equal(routeResult.winningCandidate.totalFeeBps, 41, "Total fee must be 41 bps (<= 500 bps cap)");
  assert.equal(routeResult.totalFeeWithin500BpsCap, true, "All venues must stay within 500 bps hard cap");
  assert.equal(
    routeResult.oneClickQuoteMode,
    "DRY_RUN_FEE_TIER_AND_LIVE_SPOT_ESTIMATE",
    "1Click quote mode must honestly disclose DRY_RUN_FEE_TIER_AND_LIVE_SPOT_ESTIMATE"
  );

  const confidentialStatus = parseConfidentialOneClickStatus({
    status: "SUCCESS",
    swapDetails: {
      nearTxHashes: [
        "block:276951868:J8mz55K5pqMzK2m584dtLyRh7RV8y1vgo2BsR9VQKpQT",
        "receipt:HMtrNPZyANc5EixdndbpV5ZAo5JNFTzSKXmS4MP1ZLCn",
      ],
      destinationChainTxHashes: [
        {
          hash: "EnhR2L7eUkqBkrbZmAVgwYErUVhAHtaLXvRZeB9o4ayN",
          explorerUrl: "https://testnet.nearblocks.io/txns/EnhR2L7eUkqBkrbZmAVgwYErUVhAHtaLXvRZeB9o4ayN",
        },
      ],
    },
  });
  assert.equal(confidentialStatus.settledOnNearPrivateShard, true);
  assert.equal(confidentialStatus.publicSwapTxHashExposed, false);
  assert.ok(confidentialStatus.shieldTxHash?.startsWith("block:"));
  assert.ok(confidentialStatus.unshieldTxHash?.startsWith("receipt:"));

  console.log(`  -> Live 1Click /v0/tokens Fetched: ${tokenRegistry.liveFetched} (${tokenRegistry.tokens.length} assets indexed)`);
  console.log(`  -> Live 1Click /v0/quote Authenticated: jwtAuth=${routeResult.oneClickJwtAuthenticated}, liveQuoteVerified=${routeResult.oneClickLiveQuoteVerified}, correlationId=${routeResult.oneClickDryQuoteCorrelationId ?? "n/a"}`);
  console.log(`  -> Live 1Click Explorer Telemetry: jwtConfigured=${explorerTelemetry.explorerJwtConfigured}, liveApiUsed=${explorerTelemetry.liveApiUsed} (${explorerTelemetry.statusSummary})`);
  console.log(`  -> Live RHEA Finance Pools on ref-finance.testnet: ${routeResult.rheaPoolCountOnChain} active pools`);
  for (const cand of routeResult.candidates) {
    console.log(
      `  -> Candidate [${cand.venue}]: Out=${cand.expectedAmountOutFormatted} USDT | ProtocolFee=${cand.protocolFeeBps} bps + AppFee=${cand.appFeeBps} bps = ${cand.totalFeeBps} bps | Impact=${cand.priceImpactBps} bps`
    );
  }
  console.log(`  -> Winning Venue: ${routeResult.winningVenue} (Fee Recipient: ${routeResult.feeRecipient})`);
  console.log(
    `  -> Confidential Private Shard Status: settledOnNearPrivateShard=${confidentialStatus.settledOnNearPrivateShard}, shieldTx=${confidentialStatus.shieldTxHash?.slice(0, 18)}..., unshieldTx=${confidentialStatus.unshieldTxHash?.slice(0, 20)}...\n`
  );

  // --------------------------------------------------------------------------
  // CHECK 2: Off-Chain Signed Intent, Confidential Limit Order (/v0/orders), & ANY_INPUT Sweeper
  // --------------------------------------------------------------------------
  console.log("[2/4] Testing Off-Chain Signed Intent (token_diff), Confidential Limit Order (/v0/orders), & ANY_INPUT Sweeper...");
  const signedIntent = buildAndSignOffChainIntent({
    signerId: "jubayir69.testnet",
    tokenDiff: {
      "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "-100000000",
      "nep141:usdt.tether-token.near": "99950000",
    },
    depositType: "CONFIDENTIAL_INTENTS",
    standard: "raw_ed25519",
  });
  assert.equal(signedIntent.exactPayloadBytesPreserved, true, "Off-chain intent payload bytes must never be mutated");
  assert.equal(signedIntent.signedData.payload, signedIntent.rawIntentJsonString);

  const limitOrder = createConfidentialLimitOrder({
    baseAsset: "nep141:wrap.near",
    quoteAsset: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    baseDecimals: 24,
    quoteDecimals: 6,
    quantityBaseAtomic: "25000000000000000000000000", // 25 wNEAR
    priceHuman: "3.425", // 3.425 USDC per wNEAR -> 85.625 USDC = 85_625_000 atomic USDC
    side: "SELL",
  });
  assert.equal(
    limitOrder.requestEnvelope.data.attributes.confidentiality,
    "basic",
    "Limit orders (/v0/orders) must enforce confidentiality='basic'"
  );
  assert.equal(limitOrder.requestEnvelope.data.attributes.timeInForce, "GTC");
  assert.equal(limitOrder.computedQuoteAmountCeilingAtomic, "85625000");
  assert.equal(limitOrder.vrfAntiMevSlices.length, 4);
  assert.equal(limitOrder.trackingState.isPayoutStatusFinal, true);

  const anyInputSweep = buildPartnerAnyInputSweepQuote();
  assert.equal(anyInputSweep.quoteRequest.swapType, "ANY_INPUT");
  assert.equal(anyInputSweep.quoteRequest.originAsset, "1cs_v1:any");
  assert.equal(anyInputSweep.quoteRequest.amount, "0");
  assert.equal(anyInputSweep.appFeesOmittedPerProtocolRule, true);
  assert.equal("appFees" in anyInputSweep.quoteRequest, false, "ANY_INPUT quotes must omit appFees");

  console.log(
    `  -> Off-Chain Intent (token_diff): standard=${signedIntent.standard}, depositType=${signedIntent.depositType}, exactBytesPreserved=${signedIntent.exactPayloadBytesPreserved}`
  );
  console.log(
    `  -> Confidential Limit Order (/v0/orders): confidentiality="${limitOrder.requestEnvelope.data.attributes.confidentiality}", timeInForce="${limitOrder.requestEnvelope.data.attributes.timeInForce}", quoteCeiling=${limitOrder.computedQuoteAmountCeilingAtomic} atomic USDC`
  );
  console.log(
    `  -> OutLayer VRF Anti-MEV Slices (${limitOrder.vrfAntiMevSlices.length} slices): weights=[${limitOrder.vrfAntiMevSlices.map((s) => `${s.amountBps}bps@${s.delayJitterMs}ms`).join(", ")}]`
  );
  console.log(
    `  -> Partner ANY_INPUT Sweeper: originAsset="${anyInputSweep.quoteRequest.originAsset}", appFeesOmitted=${anyInputSweep.appFeesOmittedPerProtocolRule}, recipient=${anyInputSweep.quoteRequest.recipient}\n`
  );

  // --------------------------------------------------------------------------
  // CHECK 3: Live RHEA Autonomous Farming ("amount": "0" Trick) & MPC Multi-Chain Signing
  // --------------------------------------------------------------------------
  console.log("[3/4] Testing Live RHEA Farming (ref-farming.testnet 'amount: 0' Trick) & MPC Chain Signatures (v1.signer-prod.testnet)...");
  const rheaReport = await scanAndHarvestRheaFarms();
  assert.equal(rheaReport.amountZeroWithdrawTrickVerified, true);
  assert.equal(
    rheaReport.actions.step4_withdrawRewardAmountZero.args.amount,
    "0",
    "withdraw_reward must pass amount: '0' to sweep full inner balance in 1 tx"
  );
  assert.equal(rheaReport.mcaLendingHealth.rebalanceRequired, false);
  assert.equal(rheaReport.mcaLendingHealth.healthFactor, 3.13, "MCA healthFactor must equal (12500 * 0.80) / 3200 = 3.13");

  const mpcSuite = await deriveMpcMultiChainAddresses({
    nearAccountId: "jubayir69.testnet",
    derivationPath: "kratonos-treasury-1",
  });
  assert.equal(mpcSuite.mpcContractExistsOnChain, true, "v1.signer-prod.testnet must exist on NEAR Testnet");
  assert.ok(mpcSuite.addresses.evmAddress.startsWith("0x") && mpcSuite.addresses.evmAddress.length === 42);
  assert.ok(mpcSuite.addresses.bitcoinSegwitAddress.startsWith("tb1q"));
  assert.ok(mpcSuite.addresses.zcashTransparentAddress.startsWith("t1"));
  assert.ok(mpcSuite.addresses.tonV5R1Address.startsWith("EQ"));
  assert.ok(mpcSuite.evmEip1559SignedTxHex.startsWith("0x02"));

  console.log(
    `  -> RHEA Farming (${rheaReport.farmingContractId}): liveVerified=${rheaReport.liveContractVerified}, version=${rheaReport.metadata.version}, highestRunningFarm=${rheaReport.highestRunningFarmId} (${rheaReport.rewardDistributionMode})`
  );
  console.log(
    `  -> Single-Tx Inner-Account Sweep: ${rheaReport.actions.step4_withdrawRewardAmountZero.methodName}(${JSON.stringify(rheaReport.actions.step4_withdrawRewardAmountZero.args)})`
  );
  console.log(
    `  -> Multi-Chain Lending (MCA) Health: account=${rheaReport.mcaLendingHealth.mcaAccountId}, healthFactor=${rheaReport.mcaLendingHealth.healthFactor}`
  );
  console.log(
    `  -> MPC Signer (${mpcSuite.mpcSignerContractId}): onChainVerified=${mpcSuite.mpcContractExistsOnChain}, codeHash=${mpcSuite.mpcContractCodeHash.slice(0, 16)}...`
  );
  console.log(`  -> Derived EVM Address (ETH/Base/Arb): ${mpcSuite.addresses.evmAddress}`);
  console.log(`  -> Derived Bitcoin Native SegWit:      ${mpcSuite.addresses.bitcoinSegwitAddress}`);
  console.log(`  -> Derived Solana Ed25519 Address:     ${mpcSuite.addresses.solanaAddress}`);
  console.log(`  -> Derived Zcash Transparent (t1):     ${mpcSuite.addresses.zcashTransparentAddress}`);
  console.log(`  -> Derived TON V5R1 Address:           ${mpcSuite.addresses.tonV5R1Address}\n`);

  // --------------------------------------------------------------------------
  // CHECK 4: EXACT_OUTPUT Ceiling Invoice, Fault-Isolated Batch Payroll, & Bookkeeper CSV
  // --------------------------------------------------------------------------
  console.log("[4/4] Testing EXACT_OUTPUT Ceiling-Math Invoicing, Fault-Isolated Batch Payroll, & Bookkeeper CSV Reconciliation...");
  const invoiceResult = execute_ceil_exact_output_invoice({
    invoiceId: "INV-2026-KRATON01",
    freelancerAccountId: "alice-dev.testnet",
    payerRefundAddress: "jubayir69.testnet",
    requestedNetOutputAtomic: 250_000_000n, // 250.000000 USDC
    appFeeBps: 40,
    protocolFeeBps: 1,
    memo: "Phase 5 Rust Enclave & Cross-Chain Intents Deliverable",
  });

  assert.equal(invoiceResult.requestedNetOutputFormatted, "250.000000");
  assert.ok(
    BigInt(invoiceResult.netSettledAtomic) >= 250_000_000n,
    "Freelancer must receive >= 100.00% of requested net output after fee deduction"
  );
  assert.ok(invoiceResult.exactPayoutAccuracyPercent >= 100, "Payout accuracy must be >= 100.00%");
  assert.equal(invoiceResult.scopedRelayerMetaTx.targetReceiverWhitelisted, true);

  const payrollResult = await executeFaultIsolatedBatchPayroll();
  assert.equal(payrollResult.status, "PASS");
  assert.equal(payrollResult.totalRowsImported, 12, "Must import 12 rows from sample-payroll-batch.csv");
  assert.equal(payrollResult.totalSettledCount, 11, "11 legitimate contributor rows must settle");
  assert.equal(payrollResult.totalSettledNear, 2.64, "Total settled NEAR across 11 rows must equal 2.6400 NEAR");
  assert.ok(
    payrollResult.totalSettledUsdc > 2 && payrollResult.totalSettledUsdc < 50,
    "Total settled USD equivalent must be computed dynamically from live NEAR/USD rate, never $264.00"
  );
  assert.equal(
    payrollResult.totalIsolatedFailedCount,
    1,
    "1 malicious row (unverified-quarantine-row12.testnet) must be isolated and quarantined without halting the batch"
  );
  assert.equal(payrollResult.totalBatchesChunked, 2, "12 rows must be chunked into 2 batches (max 10 per chunk)");
  assert.ok(fs.existsSync(payrollResult.exportedBookkeeperCsvPath), "Bookkeeper CSV must be written to disk");

  const teeReasoning = await executeLiveTeeReasoning(
    `Verify batch payroll settlement: ${payrollResult.totalSettledCount}/${payrollResult.totalRowsImported} settled (${payrollResult.totalSettledNear.toFixed(4)} NEAR ≈ $${payrollResult.totalSettledUsdc.toFixed(2)} USD), 1 malicious recipient quarantined.`
  );
  assert.ok(teeReasoning.content.length > 10);

  console.log(
    `  -> EXACT_OUTPUT Invoice (${invoiceResult.invoiceId}): Requested=${invoiceResult.requestedNetOutputFormatted} -> GrossCeiling=${invoiceResult.grossInputFormatted} -> NetSettled=${invoiceResult.netSettledFormatted} (${invoiceResult.exactPayoutAccuracyPercent}% accuracy)`
  );
  console.log(
    `  -> Contract-Scoped Gasless Relayer: targetReceiverWhitelisted=${invoiceResult.scopedRelayerMetaTx.targetReceiverWhitelisted}, allowed=[${invoiceResult.scopedRelayerMetaTx.relayerAllowedReceivers.join(", ")}]`
  );
  console.log(
    `  -> Fault-Isolated Batch Payroll: totalRows=${payrollResult.totalRowsImported}, settled=${payrollResult.totalSettledCount} (${payrollResult.totalSettledNear.toFixed(4)} NEAR ≈ $${payrollResult.totalSettledUsdc.toFixed(2)} USD), quarantined=${payrollResult.totalIsolatedFailedCount} (unverified-quarantine-row12.testnet)`
  );
  console.log(
    `  -> NEP-141 Storage Deposits Auto-Injected (0.00125 NEAR): ${payrollResult.storageDepositsAutoInjectedCount} recipients`
  );
  console.log(`  -> Exported Bookkeeper CSV: ${payrollResult.exportedBookkeeperCsvPath}`);
  console.log(`  -> NEAR AI Cloud TEE Reasoning (${teeReasoning.model}, liveApiUsed=${teeReasoning.usedLiveApi}): ${teeReasoning.content}`);

  console.log("\n================================================================================");
  console.log(" PHASE 5 VERIFICATION RESULT: ALL 4 PILLAR 3 & 4 FINANCIAL CHECKS PASSED");
  console.log(" STATUS: PASS");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("PHASE 5 VERIFICATION FAILED:", err);
  process.exit(1);
});
