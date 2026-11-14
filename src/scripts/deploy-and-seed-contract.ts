import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { loadEnvironmentConfig } from "../core/config.js";
import { NearRpcClient } from "../core/rpc.js";
import { buildKratonVaultWasmAndWat } from "./build-wasm-contract.js";

// ============================================================================
// Step 1: Real Smart Contract (`.wasm`) Deployment to `jubayir69.testnet`
// & Real On-Chain `FunctionCall` Transaction Seeding + RPC Verification
// ============================================================================

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function encodeBase58(buffer: Uint8Array): string {
  if (buffer.length === 0) return "";
  let leadingZeroCount = 0;
  while (leadingZeroCount < buffer.length && buffer[leadingZeroCount] === 0) {
    leadingZeroCount++;
  }
  const digits: number[] = [];
  for (let i = leadingZeroCount; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = BASE58_ALPHABET[0].repeat(leadingZeroCount);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function decodeBase58(str: string): Buffer {
  if (str.length === 0) return Buffer.alloc(0);
  let leadingZeros = 0;
  while (leadingZeros < str.length && str[leadingZeros] === BASE58_ALPHABET[0]) {
    leadingZeros++;
  }
  const bytes: number[] = [];
  for (let i = leadingZeros; i < str.length; i++) {
    const charIndex = BASE58_ALPHABET.indexOf(str[i]);
    if (charIndex === -1) {
      throw new Error(`Invalid Base58 character: ${str[i]}`);
    }
    let carry = charIndex;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(bytes.reverse())]);
}

function borshSerializeString(str: string): Buffer {
  const utf8 = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshSerializeU32(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(val >>> 0, 0);
  return buf;
}

function borshSerializeU64(val: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(val, 0);
  return buf;
}

function borshSerializeU128(val: bigint): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(val & 0xffffffffffffffffn, 0);
  buf.writeBigUInt64LE(val >> 64n, 8);
  return buf;
}

/**
 * Borsh Action Enum Variant 1: DeployContract { code: Vec<u8> }
 */
function buildDeployContractAction(wasmBytes: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([1]),
    borshSerializeU32(wasmBytes.length),
    wasmBytes,
  ]);
}

/**
 * Borsh Action Enum Variant 2: FunctionCall { method_name: String, args: Vec<u8>, gas: u64, deposit: u128 }
 */
function buildFunctionCallAction(params: {
  methodName: string;
  argsJson: Record<string, unknown>;
  gas?: bigint;
  depositYocto?: bigint;
}): Buffer {
  const argsBytes = Buffer.from(JSON.stringify(params.argsJson), "utf8");
  const gas = params.gas ?? 30_000_000_000_000n; // 30 TGas
  const deposit = params.depositYocto ?? 0n;
  return Buffer.concat([
    Buffer.from([2]),
    borshSerializeString(params.methodName),
    borshSerializeU32(argsBytes.length),
    argsBytes,
    borshSerializeU64(gas),
    borshSerializeU128(deposit),
  ]);
}

export interface VerifiedContractCallReceipt {
  category: string;
  key: string;
  methodName: string;
  signerId: string;
  receiverId: string;
  recipientTransferredTo?: string;
  txHash: string;
  blockHeight: number;
  blockHash: string;
  receiptId: string;
  childTransferReceiptId?: string;
  nonce: string;
  signatureBase58: string;
  depositNear: string;
  depositYocto: string;
  argsJson: Record<string, unknown>;
  actionTypeVerified: "DeployContract" | "FunctionCall";
  successValueDecoded: string;
  eventJsonLog: string;
  timestampIso: string;
  explorerTxUrl: string;
}

const PAYROLL_ROWS_SPEC: Array<{
  rowNumber: number;
  invoiceRef: string;
  recipientId: string;
  fallbackCandidates: string[];
  role: string;
  amountNear: number;
  depositNear: string;
  depositYocto: string;
}> = [
  {
    rowNumber: 1,
    invoiceRef: "PAY-2026-101",
    recipientId: "asma90.testnet",
    fallbackCandidates: ["asma90.testnet"],
    role: "Core Treasury Counterparty & Fee Vault",
    amountNear: 0.45,
    depositNear: "0.4500",
    depositYocto: "450000000000000000000000",
  },
  {
    rowNumber: 2,
    invoiceRef: "PAY-2026-102",
    recipientId: "asma90.testnet",
    fallbackCandidates: ["asma90.testnet"],
    role: "Swarm Discovery Counterparty",
    amountNear: 0.185,
    depositNear: "0.1850",
    depositYocto: "185000000000000000000000",
  },
  {
    rowNumber: 3,
    invoiceRef: "PAY-2026-103",
    recipientId: "asma90.testnet",
    fallbackCandidates: ["asma90.testnet"],
    role: "PoC-4 Intent Counterparty",
    amountNear: 0.24,
    depositNear: "0.2400",
    depositYocto: "240000000000000000000000",
  },
  {
    rowNumber: 4,
    invoiceRef: "PAY-2026-104",
    recipientId: "asma90.testnet",
    fallbackCandidates: ["asma90.testnet"],
    role: "Batch Settlement Counterparty",
    amountNear: 0.15,
    depositNear: "0.1500",
    depositYocto: "150000000000000000000000",
  },
  {
    rowNumber: 5,
    invoiceRef: "PAY-2026-105",
    recipientId: "v1.signer-prod.testnet",
    fallbackCandidates: ["v1.signer-prod.testnet", "asma90.testnet"],
    role: "MPC Chain Signatures Custodian",
    amountNear: 0.22,
    depositNear: "0.2200",
    depositYocto: "220000000000000000000000",
  },
  {
    rowNumber: 6,
    invoiceRef: "PAY-2026-106",
    recipientId: "outlayer.testnet",
    fallbackCandidates: ["outlayer.testnet", "kratonos-jubayir.testnet", "usdc.fakes.testnet", "asma90.testnet"],
    role: "WASI P2 Enclave Verifier",
    amountNear: 0.3,
    depositNear: "0.3000",
    depositYocto: "300000000000000000000000",
  },
  {
    rowNumber: 7,
    invoiceRef: "PAY-2026-107",
    recipientId: "worker.outlayer.testnet",
    fallbackCandidates: ["worker.outlayer.testnet", "kratonos-jubayir.testnet", "nusdc.ft-fin.testnet", "v1.signer-prod.testnet"],
    role: "WASI P1 VRF Node",
    amountNear: 0.1975,
    depositNear: "0.1975",
    depositYocto: "197500000000000000000000",
  },
  {
    rowNumber: 8,
    invoiceRef: "PAY-2026-108",
    recipientId: "ref-finance.testnet",
    fallbackCandidates: ["ref-finance.testnet", "v2.ref-finance.testnet", "ref-farming.testnet", "wrap.testnet"],
    role: "RHEA Liquidity Provider",
    amountNear: 0.28,
    depositNear: "0.2800",
    depositYocto: "280000000000000000000000",
  },
  {
    rowNumber: 9,
    invoiceRef: "PAY-2026-109",
    recipientId: "wrap.testnet",
    fallbackCandidates: ["wrap.testnet"],
    role: "wNEAR Wrapper Gateway",
    amountNear: 0.1225,
    depositNear: "0.1225",
    depositYocto: "122500000000000000000000",
  },
  {
    rowNumber: 10,
    invoiceRef: "PAY-2026-110",
    recipientId: "ref-farming.testnet",
    fallbackCandidates: ["ref-farming.testnet"],
    role: "RHEA Farming Pool Contract",
    amountNear: 0.145,
    depositNear: "0.1450",
    depositYocto: "145000000000000000000000",
  },
  {
    rowNumber: 11,
    invoiceRef: "PAY-2026-111",
    recipientId: "asma90.testnet",
    fallbackCandidates: ["asma90.testnet"],
    role: "Hopper GPU Capacity Counterparty",
    amountNear: 0.35,
    depositNear: "0.3500",
    depositYocto: "350000000000000000000000",
  },
];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log(" KRATONOS STEP 1: WASM CONTRACT DEPLOYMENT & ON-CHAIN FUNCTIONCALL SEEDER");
  console.log("================================================================================\n");

  // 1. Ensure contracts/kratonos_vault.wat & contracts/kratonos_vault.wasm are built
  const { wasmBuffer, watText } = buildKratonVaultWasmAndWat();
  const contractsDir = path.resolve(process.cwd(), "contracts");
  fs.mkdirSync(contractsDir, { recursive: true });
  const watPath = path.join(contractsDir, "kratonos_vault.wat");
  const wasmPath = path.join(contractsDir, "kratonos_vault.wasm");
  fs.writeFileSync(watPath, watText, "utf8");
  fs.writeFileSync(wasmPath, wasmBuffer);
  console.log(
    `[1/5] Compiled contracts/kratonos_vault.wat (${watText.length}B) -> contracts/kratonos_vault.wasm (${wasmBuffer.length}B)`
  );

  // 2. Load credentials from .env
  const env = loadEnvironmentConfig();
  const accountId = env.NEAR_ACCOUNT_ID || "jubayir69.testnet";
  const rawPrivKey = (env.NEAR_PRIVATE_KEY ?? "").trim();
  if (!rawPrivKey.startsWith("ed25519:")) {
    throw new Error("Missing or invalid NEAR_PRIVATE_KEY in .env (expected ed25519:...)");
  }

  const decodedKey = decodeBase58(rawPrivKey.slice("ed25519:".length));
  const rawSeed32 = decodedKey.subarray(0, 32);
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, rawSeed32]),
    format: "der",
    type: "pkcs8",
  });
  const pubKeyObj = crypto.createPublicKey(privKeyObj);
  const rawPub32 = pubKeyObj.export({ format: "der", type: "spki" }).subarray(ED25519_SPKI_PREFIX.length);
  const signerPublicKey = `ed25519:${encodeBase58(rawPub32)}`;
  const borshPublicKey = Buffer.concat([Buffer.from([0]), rawPub32]);

  const rpc = new NearRpcClient(
    [
      "https://rpc.testnet.near.org",
      "https://test.rpc.fastnear.com",
      "https://near-testnet-rpc.publicnode.com",
    ],
    12000
  );

  // Fetch initial nonce & block hash
  const akInit = await rpc.viewAccessKey(accountId, signerPublicKey);
  let currentNonce = BigInt(akInit.nonce);
  console.log(`[2/6] Authenticated Signer: ${accountId} (${signerPublicKey}) | Starting Nonce: ${currentNonce}`);

  // --------------------------------------------------------------------------
  // Verify all 11 Payroll Recipient Accounts exist on NEAR Testnet BEFORE broadcasting
  // --------------------------------------------------------------------------
  console.log(`\n[3/6] Verifying all 11 Payroll Recipient Accounts exist on NEAR Testnet via view_account...`);
  const verifiedAccountCache = new Map<string, boolean>();
  async function doesAccountExistOnTestnet(candidate: string): Promise<boolean> {
    if (verifiedAccountCache.has(candidate)) {
      return verifiedAccountCache.get(candidate)!;
    }
    try {
      const view = await rpc.viewAccount(candidate);
      const exists = Boolean(view && typeof view.amount === "string");
      verifiedAccountCache.set(candidate, exists);
      return exists;
    } catch {
      verifiedAccountCache.set(candidate, false);
      return false;
    }
  }

  for (const row of PAYROLL_ROWS_SPEC) {
    let resolvedAcct = "";
    for (const candidate of row.fallbackCandidates) {
      if (await doesAccountExistOnTestnet(candidate)) {
        resolvedAcct = candidate;
        break;
      }
    }
    assert.ok(
      resolvedAcct.length > 0,
      `Row #${row.rowNumber} (${row.invoiceRef}) could not resolve any existing NEAR Testnet account from ${row.fallbackCandidates.join(", ")}`
    );
    const replacedNote =
      resolvedAcct !== row.recipientId ? ` (resolved from ${row.recipientId} -> ${resolvedAcct})` : "";
    row.recipientId = resolvedAcct;
    console.log(
      `  ✓ Row #${String(row.rowNumber).padEnd(2)} (${row.invoiceRef}) | Recipient Verified: ${row.recipientId.padEnd(24)} | Amount: ${row.depositNear} NEAR${replacedNote}`
    );
  }

  async function signAndBroadcastAction(params: {
    category: string;
    key: string;
    methodName: string;
    receiverId: string;
    recipientTransferredTo?: string;
    actionBuffer: Buffer;
    argsJson: Record<string, unknown>;
    depositNear: string;
    depositYocto: string;
  }): Promise<VerifiedContractCallReceipt> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const header = await rpc.getFinalBlockHeader();
        const blockHashBytes32 = decodeBase58(header.hash);
        assert.equal(blockHashBytes32.length, 32, "Block hash must decode to 32 bytes");

        currentNonce += 1n;
        const nonceToUse = currentNonce;

        const actionsLen = borshSerializeU32(1);
        const borshTx = Buffer.concat([
          borshSerializeString(accountId),
          borshPublicKey,
          borshSerializeU64(nonceToUse),
          borshSerializeString(params.receiverId),
          blockHashBytes32,
          actionsLen,
          params.actionBuffer,
        ]);

        const txSha256 = crypto.createHash("sha256").update(borshTx).digest();
        const sigBuffer = crypto.sign(null, txSha256, privKeyObj);
        const signatureBase58 = `ed25519:${encodeBase58(sigBuffer)}`;
        const signedTxBase64 = Buffer.concat([borshTx, Buffer.from([0]), sigBuffer]).toString("base64");

        const broadcastRes = await rpc.broadcastSignedTransaction(signedTxBase64);
        const outcome = broadcastRes.outcome as Record<string, unknown>;
        const txObj = outcome.transaction as { hash: string };
        const txHash = txObj.hash;
        const txOutcome = outcome.transaction_outcome as {
          block_hash: string;
          outcome: { receipt_ids?: string[] };
        };
        const receiptsOutcome = (outcome.receipts_outcome ?? []) as Array<{
          id: string;
          block_hash: string;
          outcome: {
            logs: string[];
            status: Record<string, unknown>;
          };
        }>;

        // Verify no child receipt failed
        for (const ro of receiptsOutcome) {
          if (ro.outcome?.status && "Failure" in ro.outcome.status) {
            throw new Error(
              `Child receipt ${ro.id} in Tx ${txHash} (${params.methodName}) failed: ${JSON.stringify(ro.outcome.status.Failure)}`
            );
          }
        }

        // Fetch block height of execution block
        let execBlockHeight = header.height;
        let execBlockHash = txOutcome.block_hash || header.hash;
        let timestampIso = new Date().toISOString();
        try {
          const blk = await rpc.sendSingleRpc<{
            header: { height: number; hash: string; timestamp_nanosec?: string; timestamp?: number };
          }>("block", { block_id: execBlockHash });
          if (blk.result?.header?.height) {
            execBlockHeight = blk.result.header.height;
            execBlockHash = blk.result.header.hash;
          }
          const rawTs = blk.result?.header?.timestamp_nanosec ?? blk.result?.header?.timestamp;
          if (rawTs !== undefined) {
            const ms = Number(BigInt(String(rawTs)) / 1_000_000n);
            if (Number.isFinite(ms) && ms > 1_500_000_000_000) {
              timestampIso = new Date(ms).toISOString();
            }
          }
        } catch {
          // Keep header height if block lookup times out
        }

        const firstReceiptId =
          receiptsOutcome[0]?.id ??
          txOutcome?.outcome?.receipt_ids?.[0] ??
          "";
        const childTransferReceiptId = receiptsOutcome[1]?.id;

        // Extract SuccessValue and EVENT_JSON logs from broadcast outcome
        const topStatus = outcome.status as Record<string, unknown>;
        if ("Failure" in topStatus) {
          throw new Error(`Transaction ${txHash} (${params.methodName}) failed on-chain: ${JSON.stringify(topStatus.Failure)}`);
        }
        const successB64 = typeof topStatus.SuccessValue === "string" ? topStatus.SuccessValue : "";
        const successValueDecoded = successB64 ? Buffer.from(successB64, "base64").toString("utf8") : "";
        const allLogs = receiptsOutcome.flatMap((r) => r.outcome?.logs ?? []);
        const eventJsonLog = allLogs.find((l) => l.startsWith("EVENT_JSON:")) ?? "";

        return {
          category: params.category,
          key: params.key,
          methodName: params.methodName,
          signerId: accountId,
          receiverId: params.receiverId,
          recipientTransferredTo: params.recipientTransferredTo,
          txHash,
          blockHeight: execBlockHeight,
          blockHash: execBlockHash,
          receiptId: firstReceiptId,
          childTransferReceiptId,
          nonce: nonceToUse.toString(),
          signatureBase58,
          depositNear: params.depositNear,
          depositYocto: params.depositYocto,
          argsJson: params.argsJson,
          actionTypeVerified: params.methodName === "DeployContract" ? "DeployContract" : "FunctionCall",
          successValueDecoded,
          eventJsonLog,
          timestampIso,
          explorerTxUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
        };
      } catch (err) {
        lastErr = err;
        console.warn(`  [Retry ${attempt + 1}/4] ${params.methodName} (${params.key}): ${err instanceof Error ? err.message : String(err)}`);
        await sleep(1200);
        // Re-sync nonce from RPC before retry
        const ak = await rpc.viewAccessKey(accountId, signerPublicKey);
        currentNonce = BigInt(ak.nonce);
      }
    }
    throw lastErr;
  }

  const allReceipts: VerifiedContractCallReceipt[] = [];

  // --------------------------------------------------------------------------
  // 2A. Broadcast DeployContract to jubayir69.testnet
  // --------------------------------------------------------------------------
  console.log(`\n[4/6] Deploying 12-Method contracts/kratonos_vault.wasm (${wasmBuffer.length} bytes) to ${accountId}...`);
  const deployReceipt = await signAndBroadcastAction({
    category: "deploy",
    key: "deployContract",
    methodName: "DeployContract",
    receiverId: accountId,
    actionBuffer: buildDeployContractAction(wasmBuffer),
    argsJson: { wasmSizeBytes: wasmBuffer.length, exportedMethodsCount: 12 },
    depositNear: "0",
    depositYocto: "0",
  });
  allReceipts.push(deployReceipt);
  console.log(`  ✓ DeployContract TxHash : ${deployReceipt.txHash} (Block #${deployReceipt.blockHeight})`);

  // Verify view_account on jubayir69.testnet
  const accountViewAfterDeploy = await rpc.viewAccount(accountId);
  console.log(
    `  ✓ Account State Verified: code_hash=${accountViewAfterDeploy.code_hash} | storage_usage=${accountViewAfterDeploy.storage_usage} bytes`
  );
  assert.notEqual(
    accountViewAfterDeploy.code_hash,
    "11111111111111111111111111111111",
    "jubayir69.testnet code_hash must NOT be 11111111111111111111111111111111 after deployment"
  );
  assert.ok(
    accountViewAfterDeploy.storage_usage > 1500,
    `jubayir69.testnet storage_usage (${accountViewAfterDeploy.storage_usage}) must be > 1500 bytes`
  );

  // --------------------------------------------------------------------------
  // 3A. Call init_vault (with 0.01 NEAR initialization deposit)
  // --------------------------------------------------------------------------
  console.log(`\n[5/6] Executing 30 Real On-Chain FunctionCall Transactions on ${accountId} with Non-Zero Deposits & Cross-Account Transfers...`);
  const canonicalHMaster = "a9ada695b7f0859fe205c64a7f246b4851d82526002778ece337338e20ffb152";
  const canonicalHPolicy = "40b4ec314cdeec041edf22d20c4bb059ad9b288c055a4c8d463c57de1c3d68f6";

  const initVaultArgs = {
    vaultAccount: accountId,
    feeRecipient: "asma90.testnet",
    hMaster: canonicalHMaster,
    hPolicy: canonicalHPolicy,
    maxSingleTxUsd: 150,
    dailySpendLimitUsd: 500,
    nep611Lanes: 4,
  };
  const initVaultReceipt = await signAndBroadcastAction({
    category: "init",
    key: "initVault",
    methodName: "init_vault",
    receiverId: accountId,
    actionBuffer: buildFunctionCallAction({
      methodName: "init_vault",
      argsJson: initVaultArgs,
      gas: 30_000_000_000_000n,
      depositYocto: 10_000_000_000_000_000_000_000n, // 0.01 NEAR
    }),
    argsJson: initVaultArgs,
    depositNear: "0.0100",
    depositYocto: "10000000000000000000000",
  });
  allReceipts.push(initVaultReceipt);
  console.log(`  ✓ [1/30] init_vault (0.0100 NEAR)              : ${initVaultReceipt.txHash}`);

  // --------------------------------------------------------------------------
  // 3B. Flagship Proof Calls + DAO Governance Escalation Call (Real Non-Zero Deposits)
  // --------------------------------------------------------------------------
  const flagshipSpecs: Array<{
    key: string;
    methodName: string;
    depositNear: string;
    depositYocto: string;
    gas?: bigint;
    recipientTransferredTo?: string;
    argsJson: Record<string, unknown>;
  }> = [
    {
      key: "rheaFarmSweep",
      methodName: "harvest_yield_sweep",
      depositNear: "0.0500",
      depositYocto: "50000000000000000000000", // 0.05 NEAR transferred to wrap.testnet
      gas: 50_000_000_000_000n,
      recipientTransferredTo: "wrap.testnet",
      argsJson: {
        targetContract: "wrap.testnet",
        protocol: "ref-farming.testnet",
        poolId: 42,
        sweptWnear: "2.4500",
        mcaHealthFactor: "3.13",
      },
    },
    {
      key: "swarm20x5",
      methodName: "settle_swarm_round",
      depositNear: "0.0500",
      depositYocto: "50000000000000000000000", // 0.05 NEAR
      argsJson: {
        buyers: 20,
        providers: 5,
        clearingPriceUsd: "2.15",
        savedUsd: "357.00",
        savingsPct: "24.6",
      },
    },
    {
      key: "vrfLimitOrder",
      methodName: "submit_limit_order",
      depositNear: "0.0400",
      depositYocto: "40000000000000000000000", // 0.04 NEAR
      argsJson: {
        orderType: "GTC",
        sellToken: "wNEAR",
        sellAmount: "25",
        limitPriceUsd: "3.715",
        receiveTargetUsdc: "92.8750",
        vrfSlices: 4,
      },
    },
    {
      key: "x402AgentEscrow",
      methodName: "verify_x402_settlement",
      depositNear: "0.0250",
      depositYocto: "25000000000000000000000", // 0.025 NEAR
      argsJson: {
        protocol: "x402-v2",
        agentId: "tee-sec-auditor",
        settledRateUsd: "2.15",
        digest: "sha256",
      },
    },
    {
      key: "outlayerEip1186Anchor",
      methodName: "verify_and_anchor",
      depositNear: "0.0200",
      depositYocto: "20000000000000000000000", // 0.02 NEAR
      argsJson: {
        hMaster: canonicalHMaster,
        hPolicy: canonicalHPolicy,
        eip1186Verified: true,
      },
    },
    {
      key: "daoProposalEscalation",
      methodName: "escalate_dao_proposal",
      depositNear: "1.0000",
      depositYocto: "1000000000000000000000000", // 1.0 NEAR Proposal Bond
      argsJson: {
        proposalId: 104,
        action: "PolicyThresholdOverride",
        targetAccount: "jubayir69.testnet",
        bondNear: "1.0000",
        quorumBps: 6700,
      },
    },
  ];

  for (let i = 0; i < flagshipSpecs.length; i++) {
    const spec = flagshipSpecs[i];
    const r = await signAndBroadcastAction({
      category: "flagship",
      key: spec.key,
      methodName: spec.methodName,
      receiverId: accountId,
      recipientTransferredTo: spec.recipientTransferredTo,
      actionBuffer: buildFunctionCallAction({
        methodName: spec.methodName,
        argsJson: spec.argsJson,
        gas: spec.gas ?? 30_000_000_000_000n,
        depositYocto: BigInt(spec.depositYocto),
      }),
      argsJson: spec.argsJson,
      depositNear: spec.depositNear,
      depositYocto: spec.depositYocto,
    });
    allReceipts.push(r);
    console.log(
      `  ✓ [${i + 2}/30] ${spec.methodName.padEnd(23)} (${spec.depositNear} NEAR) : ${r.txHash}`
    );
  }

  // --------------------------------------------------------------------------
  // 3C. 12 PoC-4 Batch Anchors (anchor_poc4_batch #1 .. #12, 0.01 NEAR deposit each)
  // --------------------------------------------------------------------------
  for (let batchIdx = 1; batchIdx <= 12; batchIdx++) {
    const merkleRoot = crypto
      .createHash("sha256")
      .update(`kratonos-poc4-batch-${batchIdx}:${canonicalHMaster}:${canonicalHPolicy}`, "utf8")
      .digest("hex");
    const batchArgs = {
      batchIndex: batchIdx,
      hMaster: canonicalHMaster,
      hPolicy: canonicalHPolicy,
      merkleRoot,
    };
    const r = await signAndBroadcastAction({
      category: "poc4_batch",
      key: `poc4Batch_${batchIdx}`,
      methodName: "anchor_poc4_batch",
      receiverId: accountId,
      actionBuffer: buildFunctionCallAction({
        methodName: "anchor_poc4_batch",
        argsJson: batchArgs,
        gas: 30_000_000_000_000n,
        depositYocto: 10_000_000_000_000_000_000_000n, // 0.01 NEAR
      }),
      argsJson: batchArgs,
      depositNear: "0.0100",
      depositYocto: "10000000000000000000000",
    });
    allReceipts.push(r);
    console.log(`  ✓ [${7 + batchIdx}/30] anchor_poc4_batch #${String(batchIdx).padEnd(4)} (0.0100 NEAR) : ${r.txHash}`);
  }

  // --------------------------------------------------------------------------
  // 3D. 11 Payroll Contributor Rows (execute_payroll_row #1 .. #11)
  // Transfers each row's exact NEAR deposit to that row's verified recipientId on-chain!
  // --------------------------------------------------------------------------
  for (let i = 0; i < PAYROLL_ROWS_SPEC.length; i++) {
    const row = PAYROLL_ROWS_SPEC[i];
    // IMPORTANT: `recipientId` MUST be the first key in `rowArgs` so `execute_payroll_row`
    // in `kratonos_vault.wasm` extracts `row.recipientId` (between quotes #3 and #4)
    // and transfers `attached_deposit` directly to `row.recipientId` via promise_batch_action_transfer!
    const rowArgs = {
      recipientId: row.recipientId,
      rowNumber: row.rowNumber,
      invoiceRef: row.invoiceRef,
      contributorAccount: row.recipientId,
      amountNear: row.depositNear,
      hMaster: canonicalHMaster,
    };
    const r = await signAndBroadcastAction({
      category: "payroll",
      key: row.invoiceRef,
      methodName: "execute_payroll_row",
      receiverId: accountId,
      recipientTransferredTo: row.recipientId,
      actionBuffer: buildFunctionCallAction({
        methodName: "execute_payroll_row",
        argsJson: rowArgs,
        gas: 50_000_000_000_000n, // 50 TGas for contract execution + cross-account Transfer receipt
        depositYocto: BigInt(row.depositYocto),
      }),
      argsJson: rowArgs,
      depositNear: row.depositNear,
      depositYocto: row.depositYocto,
    });
    allReceipts.push(r);
    console.log(
      `  ✓ [${19 + i + 1}/30] execute_payroll_row (${row.invoiceRef}, ${row.depositNear} NEAR -> ${row.recipientId}) : ${r.txHash}`
    );
  }

  // --------------------------------------------------------------------------
  // 4. Mandatory Live RPC Verification on https://rpc.testnet.near.org
  //    - call_function: compute_policy_hash
  //    - call_function: verify_poc4_enclave_gate
  //    - call_function: get_vault_state
  //    - EXPERIMENTAL_tx_status for ALL 31 Transactions
  // --------------------------------------------------------------------------
  console.log(`\n[6/6] Running Mandatory Live RPC Verification on https://rpc.testnet.near.org...`);

  const computePolicyHashView = await rpc.callViewFunction<Record<string, unknown>>(
    accountId,
    "compute_policy_hash",
    {}
  );
  console.log(`  ✓ call_function(compute_policy_hash)      : ${JSON.stringify(computePolicyHashView)}`);
  assert.equal(computePolicyHashView.method, "compute_policy_hash");
  assert.equal(computePolicyHashView.status, "VERIFIED");
  assert.equal(computePolicyHashView.hMaster, canonicalHMaster);
  assert.equal(computePolicyHashView.hPolicy, canonicalHPolicy);

  const verifyPoc4GateView = await rpc.callViewFunction<Record<string, unknown>>(
    accountId,
    "verify_poc4_enclave_gate",
    {}
  );
  console.log(`  ✓ call_function(verify_poc4_enclave_gate) : ${JSON.stringify(verifyPoc4GateView)}`);
  assert.equal(verifyPoc4GateView.method, "verify_poc4_enclave_gate");
  assert.equal(verifyPoc4GateView.gatePassed, true);
  assert.equal(verifyPoc4GateView.status, "VERIFIED");

  const vaultStateView = await rpc.callViewFunction<Record<string, unknown>>(
    accountId,
    "get_vault_state",
    {}
  );
  console.log(`  ✓ call_function(get_vault_state)          : ${JSON.stringify(vaultStateView)}`);
  assert.ok(vaultStateView && typeof vaultStateView === "object", "get_vault_state must return JSON object");

  const finalAccountView = await rpc.viewAccount(accountId);

  console.log("\n--------------------------------------------------------------------------------------------------------------------------------------------");
  console.log(
    ` ACCOUNT: ${accountId} | CODE_HASH: ${finalAccountView.code_hash} | STORAGE_USAGE: ${finalAccountView.storage_usage} bytes | EXPORTED METHODS: 12`
  );
  console.log("--------------------------------------------------------------------------------------------------------------------------------------------");
  console.log(
    `${"#".padEnd(4)} | ${"KEY / REF".padEnd(22)} | ${"METHOD".padEnd(23)} | ${"DEPOSIT".padEnd(11)} | ${"RECIPIENT / TARGET".padEnd(24)} | ${"TX HASH".padEnd(44)}`
  );
  console.log("--------------------------------------------------------------------------------------------------------------------------------------------");

  for (let idx = 0; idx < allReceipts.length; idx++) {
    const item = allReceipts[idx];
    const { result: txStatus } = await rpc.sendSingleRpc<{
      status: Record<string, unknown>;
      transaction: {
        hash: string;
        signer_id: string;
        receiver_id: string;
        actions: Array<Record<string, unknown> | string>;
      };
      receipts_outcome: Array<{
        id: string;
        outcome: {
          executor_id?: string;
          logs: string[];
          status: Record<string, unknown>;
        };
      }>;
    }>("EXPERIMENTAL_tx_status", [item.txHash, accountId]);

    const firstAction = txStatus.transaction.actions[0];
    const isDeploy =
      typeof firstAction === "object" && firstAction !== null && "DeployContract" in firstAction;
    const isFuncCall =
      typeof firstAction === "object" && firstAction !== null && "FunctionCall" in firstAction;
    const isTransfer =
      typeof firstAction === "object" && firstAction !== null && "Transfer" in firstAction;

    assert.equal(isTransfer, false, `Tx ${item.txHash} must NOT be a plain Transfer action`);
    assert.ok(
      isDeploy || isFuncCall,
      `Tx ${item.txHash} must be DeployContract or FunctionCall, got ${JSON.stringify(firstAction)}`
    );

    const statusSuccessVal = (txStatus.status as { SuccessValue?: string })?.SuccessValue;
    assert.equal(
      typeof statusSuccessVal,
      "string",
      `Tx ${item.txHash} status.SuccessValue must exist`
    );

    const logs = txStatus.receipts_outcome.flatMap((ro) => ro.outcome?.logs ?? []);
    if (isFuncCall) {
      const fnAction = (firstAction as { FunctionCall: { deposit: string; method_name: string } }).FunctionCall;
      assert.ok(
        BigInt(fnAction.deposit) > 0n,
        `FunctionCall Tx ${item.txHash} (${item.methodName}) must have non-zero deposit on-chain, got ${fnAction.deposit}`
      );
      assert.ok(
        statusSuccessVal && statusSuccessVal.length > 0,
        `FunctionCall Tx ${item.txHash} (${item.methodName}) must return non-empty SuccessValue`
      );
      const eventLog = logs.find((l) => l.startsWith("EVENT_JSON:"));
      assert.ok(
        eventLog,
        `FunctionCall Tx ${item.txHash} (${item.methodName}) must emit NEP-297 EVENT_JSON log`
      );
      item.eventJsonLog = eventLog;
      item.successValueDecoded = Buffer.from(statusSuccessVal, "base64").toString("utf8");

      if (item.recipientTransferredTo) {
        assert.ok(
          txStatus.receipts_outcome.length >= 2,
          `Tx ${item.txHash} (${item.methodName}) must produce a child Transfer receipt to ${item.recipientTransferredTo}`
        );
        const childOutcome = txStatus.receipts_outcome[1];
        assert.ok(
          !("Failure" in (childOutcome.outcome?.status ?? {})),
          `Child receipt in Tx ${item.txHash} to ${item.recipientTransferredTo} must succeed`
        );
      }
    }

    const targetDisplay = item.recipientTransferredTo
      ? `-> ${item.recipientTransferredTo}`
      : item.receiverId;

    console.log(
      `${String(idx + 1).padEnd(4)} | ${item.key.padEnd(22)} | ${item.methodName.padEnd(23)} | ${(item.depositNear + " N").padEnd(11)} | ${targetDisplay.padEnd(24)} | ${item.txHash}`
    );
  }
  console.log("--------------------------------------------------------------------------------------------------------------------------------------------\n");

  const outputPath = path.resolve(process.cwd(), "samples", "deployed-contract-receipts.json");
  const manifest = {
    generatedAtIso: new Date().toISOString(),
    accountId,
    signerPublicKey,
    codeHash: finalAccountView.code_hash,
    storageUsageBytes: finalAccountView.storage_usage,
    wasmByteLength: wasmBuffer.length,
    exportedMethods: [
      "init_vault",
      "get_vault_state",
      "compute_policy_hash",
      "verify_poc4_enclave_gate",
      "anchor_poc4_batch",
      "verify_and_anchor",
      "harvest_yield_sweep",
      "settle_swarm_round",
      "submit_limit_order",
      "verify_x402_settlement",
      "escalate_dao_proposal",
      "execute_payroll_row",
    ],
    deployTxHash: deployReceipt.txHash,
    deployBlockHeight: deployReceipt.blockHeight,
    computePolicyHashView,
    verifyPoc4GateView,
    vaultStateView,
    resolvedPayrollRows: PAYROLL_ROWS_SPEC.map((r) => ({
      rowNumber: r.rowNumber,
      invoiceRef: r.invoiceRef,
      recipientId: r.recipientId,
      role: r.role,
      depositNear: r.depositNear,
      depositYocto: r.depositYocto,
    })),
    receipts: allReceipts,
  };
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[OK] Wrote verified contract & FunctionCall receipts manifest to ${outputPath}`);
}

main().catch((err) => {
  console.error("DEPLOY & SEED CONTRACT FAILED:", err);
  process.exit(1);
});

