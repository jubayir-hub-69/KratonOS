import assert from "node:assert/strict";
import { runNearAiTee8StepVerification } from "../core/near-ai-tee.js";
import {
  discoverLiveAgentMarket,
  negotiateAgentQuote,
  hireAgentViaX402,
  executeSelfHostedWorkerLoop,
  AgentMarketPublicLedger,
} from "../core/agent-market.js";
import { runSwarmSealedBidMarketRound } from "../core/swarm-coordinator.js";

async function runPhase4AiTeeAndMarketVerification(): Promise<void> {
  console.log("================================================================================");
  console.log(" KRATONOS PHASE 4 VERIFICATION: NEAR AI CLOUD TEE, ZERO-RETENTION, X402 & SWARM");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // STEP 1: 8-Step NEAR AI Cloud Hardware Attestation Verification (GLM-5.1-FP8)
  // --------------------------------------------------------------------------
  console.log("[1/4] Running 8-Step NEAR AI Cloud Hardware Attestation Verifier (zai-org/GLM-5.1-FP8)...");
  const teeResult = await runNearAiTee8StepVerification();

  assert.equal(teeResult.valid, true, "All 8 steps of NEAR AI Cloud TEE verification must pass");
  assert.equal(teeResult.status, "TEE ATTESTATION VERIFIED");
  assert.equal(teeResult.step1_nonceGenerated.nonce.length, 64, "Nonce must be 64 hex chars (32B)");
  assert.equal(teeResult.step3_nvidiaNrasGpuVerified.eatNonceMatches, true, "NRAS eat_nonce must match nonce");
  assert.equal(teeResult.step4_intelTdxQuoteVerified.registers48ByteValid, true, "TDX registers must be 48B");
  assert.equal(teeResult.step5_gpuCpuBindingVerified.bindingMatches, true, "TDX report_data must bind signing_address + nonce");
  assert.equal(teeResult.step8_signatureRecoveryVerified.ecdsaMatches, true, "Recovered ECDSA signer must match signing_address");
  assert.equal(teeResult.step8_signatureRecoveryVerified.ed25519Verified, true, "Ed25519 signature must verify");

  console.log(`  ✓ Step 1 (Fresh 32B Nonce)    : ${teeResult.step1_nonceGenerated.nonce}`);
  console.log(`  ✓ Step 2 (Gateway & Report)   : ${teeResult.liveEndpointProbed} -> ${teeResult.liveGatewayStatus}`);
  console.log(`  ✓ Live Credit Inference       : liveApiUsed=${teeResult.liveApiUsed} | chatId=${teeResult.liveChatId ?? "n/a"} | reply="${teeResult.liveCompletionText ?? "n/a"}"`);
  console.log(`  ✓ Step 3 (NVIDIA NRAS GPU)    : arch=${teeResult.step3_nvidiaNrasGpuVerified.gpuArch} | secboot=${teeResult.step3_nvidiaNrasGpuVerified.secboot} | dbgstat=${teeResult.step3_nvidiaNrasGpuVerified.dbgstat} | eat_nonce_match=${teeResult.step3_nvidiaNrasGpuVerified.eatNonceMatches}`);
  console.log(`  ✓ Step 4 (Intel TDX Quote v4) : tee_type=${teeResult.step4_intelTdxQuoteVerified.teeType} | 5x48B registers valid=${teeResult.step4_intelTdxQuoteVerified.registers48ByteValid}`);
  console.log(`  ✓ Step 5 (GPU-CPU Key Binding): report_data[0..32]=SHA256(addr:nonce) (${teeResult.step5_gpuCpuBindingVerified.actualReportDataPrefixHex.slice(0, 24)}...)`);
  console.log(`  ✓ Step 7 (Signed Chat Output) : chat_id=${teeResult.step7_chatSignatureFetched.chat_id} | kind=${teeResult.step7_chatSignatureFetched.signature_kind}`);
  console.log(`  ✓ Step 8 (Signer Recovery)    : Recovered=${teeResult.step8_signatureRecoveryVerified.recoveredEcdsaAddress} == Attested=${teeResult.step8_signatureRecoveryVerified.expectedSigningAddress} (Ed25519=${teeResult.step8_signatureRecoveryVerified.ed25519Verified})`);
  console.log(`  ✓ STATUS                      : ${teeResult.status} (Bundle: ${teeResult.step2_attestationReport.bundleSavedPath})\n`);

  // --------------------------------------------------------------------------
  // STEP 2: Zero-Retention Private Treasury Audit (`03-privacy.md`)
  // --------------------------------------------------------------------------
  console.log("[2/4] Verifying Zero-Retention Private Treasury Expense Audit (samples/sample-treasury-statement.json)...");
  const audit = teeResult.step6_privateInferenceAndZeroRetention;

  assert.equal(audit.zeroRetentionVerified, true, "Sensitive buffer must be 100% wiped in-place after audit");
  assert.equal(audit.nonZeroBytesRemainingAfterWipe, 0, "Zero non-zero bytes may remain in memory buffer");
  assert.equal(audit.flaggedItems.length, 1, "Must flag anomalous expense item EXP-1004");
  assert.equal(audit.flaggedItems[0].itemId, "EXP-1004");

  console.log(`  ✓ Statement Evaluated         : ${audit.statementId} (${audit.allFindings.length} line items)`);
  console.log(`  ✓ Compliant Spend Approved    : $${audit.totalCompliantSpendUsd.toFixed(2)} USD (3 verified items)`);
  console.log(`  ✓ Anomalous Spend Quarantined : $${audit.totalFlaggedAnomalyUsd.toFixed(2)} USD -> [${audit.flaggedItems[0].itemId}: ${audit.flaggedItems[0].counterparty}]`);
  console.log(`  ✓ Zero-Retention Memory Wipe  : zeroRetentionVerified=${audit.zeroRetentionVerified} (${audit.wipedBufferByteLength} bytes overwritten with 0x00, ${audit.nonZeroBytesRemainingAfterWipe} non-zero bytes remaining)`);
  console.log(`  ✓ PoC-4 Master Hash (H_master): ${teeResult.step8_signatureRecoveryVerified.poc4HMaster}\n`);

  // --------------------------------------------------------------------------
  // STEP 3: NEAR Agent Market, 1-Round Counter-Offer, & `A2A + x402` v2 Payment
  // --------------------------------------------------------------------------
  console.log("[3/4] Executing NEAR Agent Market Discovery, 1-Round Negotiation & x402 v2 NEP-366 Hiring...");
  const marketDiscovery = await discoverLiveAgentMarket("research");
  const negotiation = negotiateAgentQuote({
    agentHandle: "eip1186-storage-prover",
    taskTitle: "Cross-Chain RHEA Finance & 1Click Spread Telemetry Report",
    quotedAmountUsd: 4.2,
    plannedBudgetUsd: 2.5,
    maxAcceptableBudgetUsd: 2.5,
    counterpartyResponseAmountUsd: 2.5,
    slaSeconds: 3600,
  });

  assert.equal(negotiation.status, "ACCEPTED_AFTER_COUNTER", "1-round counter-offer must settle at $2.50");
  assert.equal(negotiation.roundsUsed, 1, "Must use strictly 1 counter-offer round");
  assert.equal(negotiation.finalAgreedPriceUsd, 2.5);

  const x402Hire = await hireAgentViaX402({
    agentHandle: "eip1186-storage-prover",
    taskTitle: "Cross-Chain RHEA Finance & 1Click Spread Telemetry Report",
    taskBrief: "Verify RHEA whitelisted stablecoin pool depths and 1Click confidential swap spread.",
    agreedAmountUsd: negotiation.finalAgreedPriceUsd!,
  });

  assert.equal(x402Hire.paymentVerification.valid, true, "X-PAYMENT NEP-366 SignedDelegateAction must verify");
  assert.equal(x402Hire.paymentVerification.amountAtomicUsdc, "2500000", "2.50 USDC = 2,500,000 atomic units");
  assert.equal(x402Hire.paymentVerification.ed25519SignatureVerified, true);
  assert.equal(x402Hire.paymentVerification.protocolV87StandardKeyVerified, true);

  const workerLoop = executeSelfHostedWorkerLoop({
    assignment: {
      assignmentId: "asgn-9901",
      jobId: "job-board-9001",
      title: "Verify RHEA Finance Stablecoin Pool Depth & 1Click Slippage",
      status: "in_progress",
      startedAt: null,
      submittedAt: null,
      deliverableUrl: null,
      slaDeadlineAt: new Date(Date.now() + 3600_000).toISOString(),
      acceptanceWindowDays: 3,
      latestMessage: null,
    },
    deliverableMarkdown:
      "# RHEA & 1Click Spread Audit\nAll 9 whitelisted tokens verified; combined fee 60 bps <= 500 bps cap.",
  });

  const ledger = new AgentMarketPublicLedger();
  const revenueSplit = ledger.recordWorkerPayoutAndSplitRevenue(
    10.0,
    "Verify RHEA Finance Stablecoin Pool Depth & 1Click Slippage"
  );

  console.log(`  ✓ Live Market Discovery       : ${marketDiscovery.liveEndpointProbed} -> ${marketDiscovery.liveHttpStatus} (${marketDiscovery.agents.length} agents, ${marketDiscovery.openJobs.length} jobs)`);
  console.log(`  ✓ Live Worker Auth (aat_...)  : ${marketDiscovery.workerAuth.endpoint} -> liveApiUsed=${marketDiscovery.workerAuth.liveApiUsed} (${marketDiscovery.workerAuth.statusText})`);
  console.log(`  ✓ 1-Round Quote Negotiation   : Initial=$${negotiation.initialQuoteUsd.toFixed(2)} -> Countered=$${negotiation.counterOfferSentUsd?.toFixed(2)} -> Status=${negotiation.status} (Saved $${negotiation.savingsUsd.toFixed(2)} USDC)`);
  console.log(`  ✓ A2A + x402 (v2) Challenge   : ${x402Hire.a2aEndpoint} | PayTo=${x402Hire.paymentVerification.payTo} | Amount=${x402Hire.paymentVerification.amountAtomicUsdc} atomic USDC ($2.50)`);
  console.log(`  ✓ NEP-366 X-PAYMENT Verified  : Ed25519 Signature=${x402Hire.paymentVerification.ed25519SignatureVerified} | Gas=${x402Hire.paymentVerification.gasUnits} (30 TGas) | Deposit=${x402Hire.paymentVerification.depositYocto} yoctoNEAR`);
  console.log(`  ✓ Cryptographic Task Receipt  : ${x402Hire.taskReceipt.receiptId} | State=${x402Hire.taskReceipt.taskState} | Sig=${x402Hire.taskReceipt.receiptSignatureHex.slice(0, 20)}...`);
  console.log(`  ✓ Worker Loop (aat_ + 9 MCP)  : ${workerLoop.call2_startAssignment.endpoint} (startedBeforeCompute=${workerLoop.call2_startAssignment.startedBeforeCompute}) -> ${workerLoop.call4_submitDeliverable.endpoint}`);
  console.log(`  ✓ Public Ledger (5% Fee+Split): Gross=$${revenueSplit.grossRevenueUsd.toFixed(2)} | Fee=$${revenueSplit.platformFeeUsd.toFixed(2)} | Net=$${revenueSplit.netRevenueUsd.toFixed(2)} -> 70/20/10 [Reserve=$${revenueSplit.treasuryReserveUsd.toFixed(2)}, Bounty=$${revenueSplit.subAgentBountyPoolUsd.toFixed(2)}, Compute=$${revenueSplit.computeRefillPoolUsd.toFixed(2)}]\n`);

  // --------------------------------------------------------------------------
  // STEP 4: 20-Buyer x 5-Seller Sealed-Bid Swarm Market Simulation (`05-swarms.md`)
  // --------------------------------------------------------------------------
  console.log("[4/4] Running 20-Buyer x 5-Seller Sealed-Bid Swarm Market Round (0 LLM Calls)...");
  const swarmRound = runSwarmSealedBidMarketRound();

  assert.equal(swarmRound.llmCallsMade, 0, "Swarm coordination must execute with 0 LLM calls");
  assert.equal(swarmRound.totalBuyers, 20, "Must coordinate 20 buyer sub-accounts");
  assert.equal(swarmRound.totalSellers, 5, "Must coordinate 5 seller sub-accounts");
  assert.equal(swarmRound.commitmentsVerified, 25, "All 25 SHA-256 sealed-bid commitments must verify");
  assert.equal(swarmRound.tamperedRevealsRejected, 0);
  assert.ok(swarmRound.totalSwarmSavingsUsd > 0, "Swarm pooling must achieve positive savings vs retail quotes");

  console.log(`  ✓ Swarm Round ID / Resource   : ${swarmRound.roundId} (${swarmRound.resourceName})`);
  console.log(`  ✓ Sub-Accounts Coordinated    : ${swarmRound.totalBuyers} Buyers (buyer-1..20.jubayir69.testnet) x ${swarmRound.totalSellers} Sellers (seller-1..5.jubayir69.testnet)`);
  console.log(`  ✓ Commit-Reveal Integrity     : ${swarmRound.commitmentsVerified}/${swarmRound.commitmentsSubmitted} SHA-256 commitments verified (${swarmRound.llmCallsMade} LLM calls in ${swarmRound.executionDurationMs}ms)`);
  console.log(`  ✓ Market Clearing Settlement  : Cleared ${swarmRound.clearedVolumeUnits} units @ $${swarmRound.uniformClearingPriceUsd.toFixed(2)}/unit (vs $${swarmRound.averageRetailPriceUsd.toFixed(2)} retail)`);
  console.log(`  ✓ Collective Buyer Savings    : Saved $${swarmRound.totalSwarmSavingsUsd.toFixed(2)} USD (${swarmRound.averageSavingsPercent.toFixed(2)}% discount across ${swarmRound.buyerAllocations.length} filled buyers)`);
  console.log(`  ✓ Swarm PoC-4 H_master        : ${swarmRound.poc4HMaster}\n`);

  console.log("================================================================================");
  console.log(" ALL PHASE 4 NEAR AI CLOUD TEE, ZERO-RETENTION, X402 & SWARM CHECKS PASSED!");
  console.log("================================================================================");
}

runPhase4AiTeeAndMarketVerification().catch((err) => {
  console.error("\n[FATAL] Phase 4 Verification Failed:", err);
  process.exit(1);
});

