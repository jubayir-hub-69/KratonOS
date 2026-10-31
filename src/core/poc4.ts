import crypto from "node:crypto";
import { HumanConstraintsConfig, loadKratonConfig } from "./config.js";

// ============================================================================
// PoC-4: Quad-Attested Proof of Constraint & 3-Tier Sputnik DAO V2 Escalation
// Formula: H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE || RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)
// ============================================================================

export interface PoC4GateInput {
  config?: HumanConstraintsConfig;
  nearAiTeeSignature: string;
  outlayerRtmr3Eip1186: string;
  oneClickQuoteAddress: string;
  tokenSymbol: string;
  slippageBps: number;
  oracleDeviationPercent: number;
  appFeeBps?: number;
  oneClickFeeBps?: number;
}

export interface PoC4GateResult {
  valid: boolean;
  hMaster: string;
  policyHash: string;
  components: {
    hashPolicy: string;
    sigNearAiTee: string;
    rtmr3OutlayerEip1186: string;
    address1ClickQuote: string;
  };
  violations: string[];
  verifiedAtIso: string;
}

export type GovernanceTier =
  | "AUTO_APPROVE"
  | "ONE_COUNCIL_FAST_TRACK"
  | "SPUTNIK_DAO_PROPOSAL"
  | "BLOCKED";

export interface SputnikDaoFunctionCallAction {
  method_name: string;
  args: string; // Base64 encoded JSON
  deposit: string;
  gas: string;
}

export interface SputnikDaoProposalPayload {
  proposal: {
    description: string;
    kind:
      | {
          Transfer: {
            token_id: string;
            receiver_id: string;
            amount: string;
            msg: string | null;
          };
        }
      | {
          FunctionCall: {
            receiver_id: string;
            actions: SputnikDaoFunctionCallAction[];
          };
        };
  };
}

export interface SputnikDaoTransactionSpec {
  receiverId: string;
  methodName: "add_proposal";
  args: SputnikDaoProposalPayload;
  argsBase64: string;
  deposit: string; // "1000000000000000000000000" (1 NEAR bond)
  gas: string; // "150000000000000" (150 TGas)
}

export interface GovernanceOperationInput {
  operationId?: string;
  intentSummary: string;
  receiverId: string;
  amountUsd: number;
  amountYoctoOrUnits: string;
  tokenSymbol: string;
  tokenContractId?: string; // "" for native NEAR, NEP-141 contract ID otherwise
  agentId: string;
  agentReputationScore: number; // 0..1000
  counterpartyRiskDecision: "allow" | "warn" | "block";
  hMaster?: string;
  functionCallSpec?: {
    targetContractId: string;
    methodName: string;
    argsJson: Record<string, unknown>;
    depositYocto: string;
    gas: string;
  };
  config?: HumanConstraintsConfig;
  sputnikDaoContractId?: string;
}

export interface GovernanceEscalationResult {
  tier: GovernanceTier;
  decision: "allow" | "warn" | "block";
  operationSha256: string;
  reason: string;
  requiresCouncilApproval: boolean;
  sputnikDaoProposalTx?: SputnikDaoTransactionSpec;
}

/**
 * Computes a deterministic SHA-256 hex digest of the active HumanConstraintsConfig.
 */
export function computePolicyHash(config: HumanConstraintsConfig): string {
  const canonicalPolicy = {
    allowed_tokens: [...config.allowed_tokens].sort(),
    app_fee_bps: config.app_fee_bps,
    daily_spend_limit_usd: config.daily_spend_limit_usd,
    emergency_kill_switch: config.emergency_kill_switch,
    limit_order_confidentiality: config.limit_order_confidentiality,
    max_daily_inference_spend_usd: config.max_daily_inference_spend_usd,
    max_oracle_deviation_percent: config.max_oracle_deviation_percent,
    max_single_tx_usd: config.max_single_tx_usd,
    max_slippage_bps: config.max_slippage_bps,
    max_total_fee_bps: config.max_total_fee_bps,
    min_report_or_task_price_usd: config.min_report_or_task_price_usd,
    nep611_gas_key_lanes: {
      count: config.nep611_gas_key_lanes.count,
      lane_0: config.nep611_gas_key_lanes.lane_0,
      lane_1: config.nep611_gas_key_lanes.lane_1,
      lane_2: config.nep611_gas_key_lanes.lane_2,
      lane_3: config.nep611_gas_key_lanes.lane_3,
    },
    revenue_split_percentages: {
      compute_refill_pool: config.revenue_split_percentages.compute_refill_pool,
      sub_agent_bounty_pool: config.revenue_split_percentages.sub_agent_bounty_pool,
      treasury_reserve: config.revenue_split_percentages.treasury_reserve,
    },
    treasury_account: config.treasury_account,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalPolicy), "utf8")
    .digest("hex");
}

function isValidHexOrSignature(value: string, minLength = 16): boolean {
  const cleaned = value.trim().replace(/^0x/i, "");
  return cleaned.length >= minLength && /^[0-9a-fA-F:._\-+/=a-zA-Z]+$/.test(cleaned);
}

function isValidQuoteAddress(address: string): boolean {
  const trimmed = address.trim();
  if (trimmed.length < 6) return false;
  // Supports NEAR named/implicit accounts, 0x EVM deposit addresses, Base58 Solana/ZEC addresses, or 1Click intent IDs
  return /^[a-zA-Z0-9._\-:]+$/.test(trimmed);
}

/**
 * Verifies the Quad-Attested Proof of Constraint (`PoC-4`) gate and computes:
 * H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE || RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)
 */
export function verify_poc4_enclave_gate(input: PoC4GateInput): PoC4GateResult {
  const runtime = loadKratonConfig();
  const config = input.config ?? runtime.constraints;
  const violations: string[] = [];

  if (config.emergency_kill_switch !== false) {
    violations.push("EMERGENCY_KILL_SWITCH_ACTIVE: Treasury operations are globally halted.");
  }

  const hashPolicy = computePolicyHash(config);
  const sigNearAiTee = (input.nearAiTeeSignature ?? "").trim();
  const rtmr3OutlayerEip1186 = (input.outlayerRtmr3Eip1186 ?? "").trim();
  const address1ClickQuote = (input.oneClickQuoteAddress ?? "").trim();

  if (!isValidHexOrSignature(hashPolicy, 64)) {
    violations.push("INVALID_HASH_POLICY: Policy SHA-256 digest is malformed.");
  }
  if (!isValidHexOrSignature(sigNearAiTee, 32)) {
    violations.push("INVALID_NEAR_AI_TEE_SIGNATURE: Hardware TEE signature is missing or too short.");
  }
  if (!isValidHexOrSignature(rtmr3OutlayerEip1186, 32)) {
    violations.push("INVALID_OUTLAYER_RTMR3_EIP1186: OutLayer WASI P2 RTMR3/EIP-1186 measurement is missing or invalid.");
  }
  if (!isValidQuoteAddress(address1ClickQuote)) {
    violations.push("INVALID_1CLICK_QUOTE_ADDRESS: 1Click quote deposit address is missing or malformed.");
  }

  if (input.slippageBps < 0 || input.slippageBps > config.max_slippage_bps) {
    violations.push(
      `SLIPPAGE_EXCEEDED: Requested ${input.slippageBps} bps exceeds max_slippage_bps (${config.max_slippage_bps} bps).`
    );
  }

  if (input.oracleDeviationPercent < 0 || input.oracleDeviationPercent > config.max_oracle_deviation_percent) {
    violations.push(
      `ORACLE_DEVIATION_EXCEEDED: Deviation ${input.oracleDeviationPercent}% exceeds max_oracle_deviation_percent (${config.max_oracle_deviation_percent}%).`
    );
  }

  const normalizedToken = (input.tokenSymbol ?? "").trim();
  const tokenAllowed = config.allowed_tokens.some(
    (allowed) => allowed.toLowerCase() === normalizedToken.toLowerCase()
  );
  if (!tokenAllowed) {
    violations.push(
      `TOKEN_NOT_WHITELISTED: Token '${normalizedToken}' is not in config.allowed_tokens (${config.allowed_tokens.join(", ")}).`
    );
  }

  const appFee = input.appFeeBps ?? config.app_fee_bps;
  const oneClickFee = input.oneClickFeeBps ?? 0;
  const totalFeeBps = appFee + oneClickFee;
  if (totalFeeBps > 500 || totalFeeBps > config.max_total_fee_bps) {
    violations.push(
      `TOTAL_FEE_CEILING_EXCEEDED: Combined fee (${totalFeeBps} bps) exceeds hard protocol cap (500 bps).`
    );
  }

  // Exact PoC-4 master commitment:
  // H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE || RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)
  const preimage = `${hashPolicy}||${sigNearAiTee}||${rtmr3OutlayerEip1186}||${address1ClickQuote}`;
  const hMaster = crypto.createHash("sha256").update(preimage, "utf8").digest("hex");

  return {
    valid: violations.length === 0,
    hMaster,
    policyHash: hashPolicy,
    components: {
      hashPolicy,
      sigNearAiTee,
      rtmr3OutlayerEip1186,
      address1ClickQuote,
    },
    violations,
    verifiedAtIso: new Date().toISOString(),
  };
}

/**
 * Implements the 3-Tier Earned-Trust Governance & Bounty Escalation Engine (Sputnik DAO V2 & Trezu):
 * - Tier 1 (AUTO_APPROVE): amountUsd <= config.max_single_tx_usd AND agentReputationScore >= 700 AND counterpartyRiskDecision === 'allow'
 * - Tier 2 (ONE_COUNCIL_FAST_TRACK): Mid-size spend (amountUsd <= config.daily_spend_limit_usd) or counterpartyRiskDecision === 'warn' (when within single tx cap)
 * - Tier 3 (SPUTNIK_DAO_PROPOSAL): Over-limit spend (amountUsd > config.max_single_tx_usd or low reputation) -> builds Sputnik DAO V2 `add_proposal` with 1 NEAR bond.
 */
export function escalate_sha256_to_sputnik_bounty(
  operation: GovernanceOperationInput
): GovernanceEscalationResult {
  const runtime = loadKratonConfig();
  const config = operation.config ?? runtime.constraints;
  const sputnikDaoContractId =
    operation.sputnikDaoContractId ??
    config.governance_tiers?.sputnik_dao_contract_id ??
    runtime.env.SPUTNIK_DAO_CONTRACT_ID;

  const canonicalOpPayload = {
    agentId: operation.agentId,
    agentReputationScore: operation.agentReputationScore,
    amountUsd: Number(operation.amountUsd.toFixed(2)),
    amountYoctoOrUnits: operation.amountYoctoOrUnits,
    counterpartyRiskDecision: operation.counterpartyRiskDecision,
    hMaster: operation.hMaster ?? "UNSET",
    intentSummary: operation.intentSummary,
    operationId: operation.operationId ?? "kraton-op",
    receiverId: operation.receiverId,
    tokenContractId: operation.tokenContractId ?? "",
    tokenSymbol: operation.tokenSymbol,
  };

  const operationSha256 = crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalOpPayload), "utf8")
    .digest("hex");

  // Hard block if emergency kill switch is active or counterparty risk is 'block'
  if (config.emergency_kill_switch) {
    return {
      tier: "BLOCKED",
      decision: "block",
      operationSha256,
      reason: "Emergency kill switch is enabled in config.yaml.",
      requiresCouncilApproval: true,
    };
  }

  if (operation.counterpartyRiskDecision === "block") {
    return {
      tier: "BLOCKED",
      decision: "block",
      operationSha256,
      reason: `Counterparty risk scorer blocked receiver '${operation.receiverId}'.`,
      requiresCouncilApproval: true,
    };
  }

  const buildSputnikProposal = (reasonTag: string): SputnikDaoTransactionSpec => {
    const description = [
      `[KratonOS Autonomous Treasury Escalation] ${operation.intentSummary}`,
      `Recipient: ${operation.receiverId} | Value: $${operation.amountUsd.toFixed(2)} USD (${operation.amountYoctoOrUnits} ${operation.tokenSymbol})`,
      `Agent: ${operation.agentId} (Reputation: ${operation.agentReputationScore}/1000) | Escalation Reason: ${reasonTag}`,
      `SHA256_OP_HASH: ${operationSha256}`,
      `POC4_H_MASTER: ${operation.hMaster ?? "PENDING_POC4"}`,
    ].join(" || ");

    let kind: SputnikDaoProposalPayload["proposal"]["kind"];

    if (operation.functionCallSpec) {
      const actionArgsB64 = Buffer.from(
        JSON.stringify(operation.functionCallSpec.argsJson),
        "utf8"
      ).toString("base64");

      kind = {
        FunctionCall: {
          receiver_id: operation.functionCallSpec.targetContractId,
          actions: [
            {
              method_name: operation.functionCallSpec.methodName,
              args: actionArgsB64,
              deposit: operation.functionCallSpec.depositYocto,
              gas: operation.functionCallSpec.gas,
            },
          ],
        },
      };
    } else {
      kind = {
        Transfer: {
          token_id: operation.tokenContractId ?? "",
          receiver_id: operation.receiverId,
          amount: operation.amountYoctoOrUnits,
          msg: null,
        },
      };
    }

    const proposalArgs: SputnikDaoProposalPayload = {
      proposal: {
        description,
        kind,
      },
    };

    return {
      receiverId: sputnikDaoContractId,
      methodName: "add_proposal",
      args: proposalArgs,
      argsBase64: Buffer.from(JSON.stringify(proposalArgs), "utf8").toString("base64"),
      deposit: "1000000000000000000000000", // 1 NEAR bond required by Sputnik DAO V2
      gas: "150000000000000", // 150 TGas
    };
  };

  // Check if spend exceeds max_single_tx_usd ($150.00) or agent reputation is critically low (< 400)
  if (operation.amountUsd > config.max_single_tx_usd || operation.agentReputationScore < 400) {
    const reason =
      operation.amountUsd > config.max_single_tx_usd
        ? `Requested spend ($${operation.amountUsd.toFixed(2)}) exceeds max_single_tx_usd ($${config.max_single_tx_usd.toFixed(2)}); escalated to Sputnik DAO V2 on-chain proposal.`
        : `Agent reputation (${operation.agentReputationScore}/1000) is below autonomous threshold; escalated to Sputnik DAO V2 on-chain proposal.`;

    return {
      tier: "SPUTNIK_DAO_PROPOSAL",
      decision: "warn",
      operationSha256,
      reason,
      requiresCouncilApproval: true,
      sputnikDaoProposalTx: buildSputnikProposal(reason),
    };
  }

  // Tier 1: AUTO_APPROVE
  // amountUsd <= config.max_single_tx_usd AND agentReputationScore >= 700 AND counterpartyRiskDecision === 'allow'
  if (
    operation.amountUsd <= config.max_single_tx_usd &&
    operation.agentReputationScore >= 700 &&
    operation.counterpartyRiskDecision === "allow"
  ) {
    return {
      tier: "AUTO_APPROVE",
      decision: "allow",
      operationSha256,
      reason: `Tier 1 Auto-Approved: Spend ($${operation.amountUsd.toFixed(2)} <= $${config.max_single_tx_usd.toFixed(2)}), high reputation (${operation.agentReputationScore}/1000 >= 700), and counterparty risk 'allow'.`,
      requiresCouncilApproval: false,
    };
  }

  // Tier 2: ONE_COUNCIL_FAST_TRACK (e.g., counterparty decision === 'warn' or moderate reputation 400..699 within limit)
  const tier2Reason = `Tier 2 Single-Council Fast-Track: Spend ($${operation.amountUsd.toFixed(2)} <= $${config.daily_spend_limit_usd.toFixed(2)}) with counterparty='${operation.counterpartyRiskDecision}' and reputation=${operation.agentReputationScore}/1000.`;
  return {
    tier: "ONE_COUNCIL_FAST_TRACK",
    decision: "warn",
    operationSha256,
    reason: tier2Reason,
    requiresCouncilApproval: true,
    sputnikDaoProposalTx: buildSputnikProposal(tier2Reason),
  };
}

