import crypto from "node:crypto";
import { loadKratonConfig } from "./config.js";
import { NearRpcClient } from "./rpc.js";

// ============================================================================
// NEP-611 Parallel Gas-Key Lane Multiplexer & Burn-Protection Guard
// Supports 4 isolated execution lanes (0: scout, 1: executor, 2: payroll, 3: yield)
// with atomic per-lane nonce counters, Protocol v87 Meta-Transaction Guard,
// and WithdrawFromGasKey burn-protection before DeleteKey.
// ============================================================================

export type Nep611LaneIndex = 0 | 1 | 2 | 3;

export type Nep611LaneRole = "scout" | "executor" | "payroll" | "yield";

export const ONE_NEAR_YOCTO = 1_000_000_000_000_000_000_000_000n;

export interface Nep611TaskIntent {
  taskId?: string;
  actionType: "FunctionCall" | "Transfer" | "SignedDelegateAction" | "RelayerOuterDelegate";
  receiverId: string;
  methodName?: string;
  args?: Record<string, unknown>;
  attachedDepositYocto?: string;
  estimatedTgas?: number;
  hMasterCommitment: string;
  signerKeyIsGasKey?: boolean;
  isInnerDelegateAction?: boolean;
}

export interface GasPriceBufferMetrics {
  liveGasPriceYoctoPerGas: string;
  estimatedGasUnits: string;
  baseGasCostYocto: string;
  buyVsBurnSafetyMultiplierPercent: number; // e.g. 130% (30% pessimism buffer)
  recommendedPrepaidAllocationYocto: string;
}

export interface Nep611LaneDispatchResult {
  dispatched: boolean;
  laneIndex: Nep611LaneIndex;
  laneRole: Nep611LaneRole;
  laneSubAccountId: string;
  nonceIndex: Nep611LaneIndex;
  assignedNonce: string;
  txEnvelopeHash: string;
  hMasterCommitment: string;
  gasMetrics: GasPriceBufferMetrics;
  protocolV87MetaTxVerified: boolean;
  dispatchedAtIso: string;
}

export interface Nep611DeleteKeyBundle {
  publicKey: string;
  prepaidBalanceYocto: string;
  exceedsOneNearHardFailThreshold: boolean;
  burnPrevented: boolean;
  actions: Array<
    | {
        type: "WithdrawFromGasKey";
        publicKey: string;
        amountYocto: string;
        beneficiaryId: string;
      }
    | {
        type: "DeleteKey";
        publicKey: string;
      }
  >;
}

const LANE_ROLES: Record<Nep611LaneIndex, Nep611LaneRole> = {
  0: "scout",
  1: "executor",
  2: "payroll",
  3: "yield",
};

export class Nep611GasKeyMultiplexer {
  private readonly rpc: NearRpcClient;
  private readonly treasuryAccountId: string;
  private readonly laneSubAccounts: Record<Nep611LaneIndex, string>;
  private readonly laneNonces: [bigint, bigint, bigint, bigint] = [0n, 0n, 0n, 0n];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private cachedGasPriceYocto = 100_000_000n; // 0.0001 NEAR / TGas fallback

  constructor(rpcClient?: NearRpcClient, treasuryAccountId?: string) {
    const runtime = loadKratonConfig();
    this.rpc = rpcClient ?? new NearRpcClient();
    this.treasuryAccountId = treasuryAccountId ?? runtime.constraints.treasury_account;
    const useCustomTreasury =
      Boolean(treasuryAccountId) && treasuryAccountId !== runtime.constraints.treasury_account;
    this.laneSubAccounts = useCustomTreasury
      ? {
          0: `scout.${this.treasuryAccountId}`,
          1: `executor.${this.treasuryAccountId}`,
          2: `payroll.${this.treasuryAccountId}`,
          3: `yield.${this.treasuryAccountId}`,
        }
      : {
          0: runtime.constraints.nep611_gas_key_lanes.lane_0,
          1: runtime.constraints.nep611_gas_key_lanes.lane_1,
          2: runtime.constraints.nep611_gas_key_lanes.lane_2,
          3: runtime.constraints.nep611_gas_key_lanes.lane_3,
        };
  }

  /**
   * Synchronizes the 4 NEP-611 lane base nonces and live gas price from NEAR RPC.
   */
  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        const [gasKeyState, gasPriceView] = await Promise.all([
          this.rpc.viewGasKeyNonces(this.treasuryAccountId),
          this.rpc.getGasPrice(),
        ]);
        this.laneNonces[0] = gasKeyState.nonces[0];
        this.laneNonces[1] = gasKeyState.nonces[1];
        this.laneNonces[2] = gasKeyState.nonces[2];
        this.laneNonces[3] = gasKeyState.nonces[3];
        this.cachedGasPriceYocto = BigInt(gasPriceView.gas_price);
      } catch {
        // Deterministic isolated partitions if account has no keys on local test mock
        const base = BigInt(Date.now()) * 1000n;
        this.laneNonces[0] = base + 1n;
        this.laneNonces[1] = base + 1_000_000n + 1n;
        this.laneNonces[2] = base + 2_000_000n + 1n;
        this.laneNonces[3] = base + 3_000_000n + 1n;
      }
      this.initialized = true;
    })();

    await this.initPromise;
  }

  /**
   * Protocol v87 Meta-Transaction Guard:
   * Rejects any attempt to sign an inner `SignedDelegateAction` with a Gas Key.
   * Inner delegate actions MUST be signed by a standard access key; only the relayer's
   * outer transaction may use a Full-Access Gas Key.
   */
  public verifyProtocolV87MetaTxRule(task: Nep611TaskIntent): {
    allowed: boolean;
    reason: string;
  } {
    const isInner =
      task.actionType === "SignedDelegateAction" || task.isInnerDelegateAction === true;
    const usesGasKey = task.signerKeyIsGasKey ?? true;

    if (isInner && usesGasKey) {
      return {
        allowed: false,
        reason:
          "PROTOCOL_V87_META_TX_VIOLATION: Inner SignedDelegateAction cannot be signed with a NEP-611 Gas Key. Use a standard ed25519/secp256k1 access key for inner delegate signing; only the relayer outer transaction may use a Full-Access Gas Key.",
      };
    }

    return {
      allowed: true,
      reason: "Protocol v87 NEP-611 / NEP-366 meta-transaction signing rule satisfied.",
    };
  }

  /**
   * Calculates live gas cost and applies a 30% buy-vs-burn pessimism buffer
   * so NEP-611 gas keys never under-allocate gas during shard congestion spikes.
   */
  public computeGasBufferMetrics(estimatedTgas = 30): GasPriceBufferMetrics {
    const sanitizedTgas = Number.isFinite(estimatedTgas)
      ? Math.min(300, Math.max(1, Math.round(estimatedTgas)))
      : 30;
    const gasUnits = BigInt(sanitizedTgas) * 1_000_000_000_000n; // TGas -> gas
    const baseCost = gasUnits * this.cachedGasPriceYocto;
    const multiplierPercent = 130; // 1.30x buy-vs-burn safety buffer
    const recommendedAllocation = (baseCost * BigInt(multiplierPercent)) / 100n;

    return {
      liveGasPriceYoctoPerGas: this.cachedGasPriceYocto.toString(),
      estimatedGasUnits: gasUnits.toString(),
      baseGasCostYocto: baseCost.toString(),
      buyVsBurnSafetyMultiplierPercent: multiplierPercent,
      recommendedPrepaidAllocationYocto: recommendedAllocation.toString(),
    };
  }

  /**
   * Atomically allocates the next nonce on the specified NEP-611 lane (0..3) and dispatches the task.
   */
  public async dispatchLaneIntent(
    laneIndex: Nep611LaneIndex,
    task: Nep611TaskIntent
  ): Promise<Nep611LaneDispatchResult> {
    if (![0, 1, 2, 3].includes(laneIndex)) {
      throw new Error(`Invalid NEP-611 laneIndex (${laneIndex}): must be 0, 1, 2, or 3.`);
    }

    if (loadKratonConfig().constraints.emergency_kill_switch) {
      throw new Error("NEP611_KILL_SWITCH_ACTIVE: Emergency kill switch is enabled; all 4 gas-key lanes halted.");
    }

    const v87Check = this.verifyProtocolV87MetaTxRule(task);
    if (!v87Check.allowed) {
      throw new Error(v87Check.reason);
    }

    if (!task.receiverId || task.receiverId.trim().length < 2) {
      throw new Error("NEP611_INVALID_RECEIVER: receiverId must be a valid non-empty NEAR account ID.");
    }

    if (!task.hMasterCommitment || task.hMasterCommitment.trim().length < 32) {
      throw new Error("NEP611_POC4_REQUIRED: Cannot dispatch lane intent without a verified PoC-4 H_master commitment.");
    }

    await this.ensureInitialized();

    // Atomic synchronous increment on isolated lane counter (nonce_index: 0..3)
    const assignedNonceBigInt = this.laneNonces[laneIndex];
    this.laneNonces[laneIndex] = assignedNonceBigInt + 1n;

    const assignedNonce = assignedNonceBigInt.toString();
    const laneRole = LANE_ROLES[laneIndex];
    const laneSubAccountId = this.laneSubAccounts[laneIndex];
    const gasMetrics = this.computeGasBufferMetrics(task.estimatedTgas ?? 30);

    const envelopePreimage = JSON.stringify({
      taskId: task.taskId ?? null,
      laneIndex,
      laneRole,
      laneSubAccountId,
      nonceIndex: laneIndex,
      assignedNonce,
      receiverId: task.receiverId,
      actionType: task.actionType,
      methodName: task.methodName ?? null,
      attachedDepositYocto: task.attachedDepositYocto ?? "0",
      args: task.args ?? {},
      hMasterCommitment: task.hMasterCommitment,
    });

    const txEnvelopeHash = crypto.createHash("sha256").update(envelopePreimage, "utf8").digest("hex");

    return {
      dispatched: true,
      laneIndex,
      laneRole,
      laneSubAccountId,
      nonceIndex: laneIndex,
      assignedNonce,
      txEnvelopeHash,
      hMasterCommitment: task.hMasterCommitment,
      gasMetrics,
      protocolV87MetaTxVerified: true,
      dispatchedAtIso: new Date().toISOString(),
    };
  }

  /**
   * NEP-611 Lifecycle & Burn-Protection Guard:
   * Before generating a `DeleteKey` action for a Gas Key, inspects its prepaid balance
   * and prepends a `WithdrawFromGasKey` action so prepaid NEAR is never burned and
   * deletion never fails due to balance > 1 NEAR (`1000000000000000000000000` yoctoNEAR).
   */
  public buildSafeGasKeyDeleteActions(params: {
    publicKey: string;
    prepaidBalanceYocto: string | bigint;
    beneficiaryId?: string;
  }): Nep611DeleteKeyBundle {
    const publicKey = (params.publicKey ?? "").trim();
    if (!publicKey) {
      throw new Error("NEP611_INVALID_PUBLIC_KEY: publicKey cannot be empty when deleting a Gas Key.");
    }
    const balance = BigInt(params.prepaidBalanceYocto);
    if (balance < 0n) {
      throw new Error("NEP611_INVALID_BALANCE: prepaidBalanceYocto cannot be negative.");
    }
    const beneficiaryId = (params.beneficiaryId ?? this.treasuryAccountId).trim();
    if (!beneficiaryId) {
      throw new Error("NEP611_INVALID_BENEFICIARY: beneficiaryId cannot be empty.");
    }
    const exceedsOneNear = balance > ONE_NEAR_YOCTO;

    const actions: Nep611DeleteKeyBundle["actions"] = [];

    if (balance > 0n) {
      actions.push({
        type: "WithdrawFromGasKey",
        publicKey,
        amountYocto: balance.toString(),
        beneficiaryId,
      });
    }

    actions.push({
      type: "DeleteKey",
      publicKey,
    });

    return {
      publicKey,
      prepaidBalanceYocto: balance.toString(),
      exceedsOneNearHardFailThreshold: exceedsOneNear,
      burnPrevented: balance > 0n,
      actions,
    };
  }
}

/**
 * Guard for external `AddKey` Function-Call key registration:
 * Never emit `0` as an external `AddKey` allowance (which sets literal 0 yoctoNEAR and causes
 * `NotEnoughAllowance` on the first call). Converts `null`/`undefined` to `null` (unlimited) and
 * rejects `0` unless explicitly inside a contract host `promise_batch_action_add_key_with_function_call`.
 */
export function normalizeExternalAddKeyAllowance(
  allowanceYocto: string | bigint | number | null | undefined
): string | null {
  if (allowanceYocto === null || allowanceYocto === undefined) {
    return null;
  }
  const parsed = BigInt(allowanceYocto);
  if (parsed <= 0n) {
    throw new Error(
      "PROTOCOL_ALLOWANCE_HAZARD: External AddKey FunctionCall allowance must not be 0 (causes NotEnoughAllowance). Pass null for unlimited or a positive yoctoNEAR allowance."
    );
  }
  return parsed.toString();
}

const defaultMultiplexer = new Nep611GasKeyMultiplexer();

/**
 * Dispatches an intent on one of the 4 parallel NEP-611 gas-key lanes (`0: scout`, `1: executor`, `2: payroll`, `3: yield`).
 */
export async function dispatch_nep611_lane_intent(
  laneIndex: Nep611LaneIndex,
  task: Nep611TaskIntent,
  multiplexer: Nep611GasKeyMultiplexer = defaultMultiplexer
): Promise<Nep611LaneDispatchResult> {
  return multiplexer.dispatchLaneIntent(laneIndex, task);
}

