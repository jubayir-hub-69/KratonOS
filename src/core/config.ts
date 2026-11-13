import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import YAML from "yaml";

// ============================================================================
// Strongly-Typed Interfaces for KratonOS Human Constraints & Environment
// ============================================================================

export interface RevenueSplitConfig {
  treasury_reserve: number;
  sub_agent_bounty_pool: number;
  compute_refill_pool: number;
}

export interface Nep611LaneConfig {
  count: number;
  lane_0: string;
  lane_1: string;
  lane_2: string;
  lane_3: string;
}

export interface GovernanceTiersConfig {
  tier_1_auto_approve_max_usd: number;
  tier_2_single_council_max_usd: number;
  tier_3_sputnik_dao_proposal_bond_near: string;
  sputnik_dao_contract_id: string;
}

export interface ProtocolRulesConfig {
  rust_toolchain_version: string;
  near_rpc_batching_allowed: boolean;
  oneclick_swap_settlement: string;
  post_quantum_audit_scheme: string;
}

export interface HumanConstraintsConfig {
  treasury_account: string;
  emergency_kill_switch: boolean;
  daily_spend_limit_usd: number;
  max_single_tx_usd: number;
  max_daily_inference_spend_usd: number;
  min_report_or_task_price_usd: number;
  max_slippage_bps: number;
  max_oracle_deviation_percent: number;
  app_fee_bps: number;
  max_total_fee_bps: number;
  limit_order_confidentiality: "basic";
  revenue_split_percentages: RevenueSplitConfig;
  nep611_gas_key_lanes_count: number;
  nep611_gas_key_lanes: Nep611LaneConfig;
  allowed_tokens: string[];
  governance_tiers?: GovernanceTiersConfig;
  protocol_rules?: ProtocolRulesConfig;
}

export interface EnvironmentConfig {
  NEAR_NETWORK_ID: "testnet" | "mainnet";
  NEAR_ACCOUNT_ID: string;
  NEAR_RPC_URL: string;
  NEAR_FALLBACK_RPC_URLS: string[];
  NEAR_MAINNET_RPC_URL: string;
  NEAR_PRIVATE_KEY: string;
  ONECLICK_BASE_URL: string;
  ONECLICK_API_KEY: string;
  ONECLICK_EXPLORER_API_KEY: string;
  PROTOCOL_FEE_RECIPIENT: string;
  NEARAI_CLOUD_BASE_URL: string;
  NEARAI_CLOUD_API_KEY: string;
  NEARAI_MODEL: string;
  AGENT_MARKET_BASE_URL: string;
  AGENT_MARKET_API_TOKEN: string;
  OUTLAYER_CONTRACT_ID: string;
  OUTLAYER_WORKER_CONTRACT_ID: string;
  RHEA_EXCHANGE_CONTRACT_ID: string;
  RHEA_FARMING_CONTRACT_ID: string;
  SPUTNIK_DAO_CONTRACT_ID: string;
  MPC_SIGNER_CONTRACT_ID: string;
}

export interface KratonRuntimeConfig {
  constraints: HumanConstraintsConfig;
  env: EnvironmentConfig;
  workspaceRoot: string;
}

// ============================================================================
// Zero-Config Environment & YAML Loader
// ============================================================================

export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  const candidates = [startDir];
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(moduleDir, path.resolve(moduleDir, "..", ".."));
  } catch {
    // Fallback if import.meta.url is unavailable
  }

  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (true) {
      if (
        fs.existsSync(path.join(current, "config.yaml")) ||
        fs.existsSync(path.join(current, "package.json"))
      ) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return path.resolve(startDir);
}

export function loadEnvironmentConfig(workspaceRoot: string = resolveWorkspaceRoot()): EnvironmentConfig {
  const envExamplePath = path.join(workspaceRoot, ".env.example");
  const envPath = path.join(workspaceRoot, ".env");

  const parsedExample = fs.existsSync(envExamplePath)
    ? dotenv.parse(fs.readFileSync(envExamplePath, "utf8"))
    : {};
  const parsedEnv = fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
    : {};

  // Populate process.env without overriding existing explicit environment variables
  dotenv.config({ path: envPath });

  const getVal = (key: string, fallback: string): string => {
    const val = process.env[key] ?? parsedEnv[key] ?? parsedExample[key];
    return val !== undefined && val.trim() !== "" ? val.trim() : fallback;
  };

  const networkRaw = getVal("NEAR_NETWORK_ID", "testnet").toLowerCase();
  const networkId: "testnet" | "mainnet" = networkRaw === "mainnet" ? "mainnet" : "testnet";

  const defaultPrimaryRpc =
    networkId === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com";
  const primaryRpc = getVal("NEAR_RPC_URL", defaultPrimaryRpc);
  const defaultFallbacks =
    networkId === "mainnet"
      ? [
          "https://free.rpc.fastnear.com",
          primaryRpc,
          "https://near-rpc.publicnode.com",
          "https://rpc.mainnet.near.org",
        ]
      : [
          "https://test.rpc.fastnear.com",
          "https://near-testnet-rpc.publicnode.com",
          primaryRpc,
          "https://rpc.testnet.near.org",
          "https://near-testnet.api.pagoda.co/rpc/v1",
        ];
  const uniqueFallbacks = Array.from(new Set(defaultFallbacks));

  return {
    NEAR_NETWORK_ID: networkId,
    NEAR_ACCOUNT_ID: getVal("NEAR_ACCOUNT_ID", "jubayir69.testnet"),
    NEAR_RPC_URL: primaryRpc,
    NEAR_FALLBACK_RPC_URLS: uniqueFallbacks,
    NEAR_MAINNET_RPC_URL: getVal("NEAR_MAINNET_RPC_URL", "https://rpc.mainnet.near.org"),
    NEAR_PRIVATE_KEY: process.env.NEAR_PRIVATE_KEY ?? parsedEnv.NEAR_PRIVATE_KEY ?? "",
    ONECLICK_BASE_URL: getVal("ONECLICK_BASE_URL", "https://1click.chaindefuser.com"),
    ONECLICK_API_KEY: process.env.ONECLICK_API_KEY ?? parsedEnv.ONECLICK_API_KEY ?? "",
    ONECLICK_EXPLORER_API_KEY: process.env.ONECLICK_EXPLORER_API_KEY ?? parsedEnv.ONECLICK_EXPLORER_API_KEY ?? "",
    PROTOCOL_FEE_RECIPIENT: getVal("PROTOCOL_FEE_RECIPIENT", "asma90.testnet"),
    NEARAI_CLOUD_BASE_URL: getVal("NEARAI_CLOUD_BASE_URL", "https://cloud-api.near.ai/v1"),
    NEARAI_CLOUD_API_KEY: process.env.NEARAI_CLOUD_API_KEY ?? parsedEnv.NEARAI_CLOUD_API_KEY ?? "",
    NEARAI_MODEL: getVal("NEARAI_MODEL", "zai-org/GLM-5.1-FP8"),
    AGENT_MARKET_BASE_URL: getVal("AGENT_MARKET_BASE_URL", "https://market.near.ai"),
    AGENT_MARKET_API_TOKEN: process.env.AGENT_MARKET_API_TOKEN ?? parsedEnv.AGENT_MARKET_API_TOKEN ?? "",
    OUTLAYER_CONTRACT_ID: getVal("OUTLAYER_CONTRACT_ID", "outlayer.testnet"),
    OUTLAYER_WORKER_CONTRACT_ID: getVal("OUTLAYER_WORKER_CONTRACT_ID", "worker.outlayer.testnet"),
    RHEA_EXCHANGE_CONTRACT_ID: getVal("RHEA_EXCHANGE_CONTRACT_ID", "ref-finance.testnet"),
    RHEA_FARMING_CONTRACT_ID: getVal("RHEA_FARMING_CONTRACT_ID", "ref-farming.testnet"),
    SPUTNIK_DAO_CONTRACT_ID: getVal("SPUTNIK_DAO_CONTRACT_ID", "jubayir69.testnet"),
    MPC_SIGNER_CONTRACT_ID: getVal("MPC_SIGNER_CONTRACT_ID", "v1.signer-prod.testnet"),
  };
}

export function validateHumanConstraints(raw: Record<string, unknown>): HumanConstraintsConfig {
  const treasuryAccount = String(raw.treasury_account ?? "jubayir69.testnet").trim();
  if (!treasuryAccount) {
    throw new Error("Invalid treasury_account: cannot be empty.");
  }
  const emergencyKillSwitch =
    raw.emergency_kill_switch === true ||
    String(raw.emergency_kill_switch ?? "false")
      .trim()
      .toLowerCase() === "true";
  const dailySpendLimitUsd = Number(raw.daily_spend_limit_usd ?? 500.0);
  const maxSingleTxUsd = Number(raw.max_single_tx_usd ?? 150.0);
  const maxDailyInferenceSpendUsd = Number(raw.max_daily_inference_spend_usd ?? 5.0);
  const minReportOrTaskPriceUsd = Number(raw.min_report_or_task_price_usd ?? 2.5);
  const maxSlippageBps = Number(raw.max_slippage_bps ?? 100);
  const maxOracleDeviationPercent = Number(raw.max_oracle_deviation_percent ?? 5.0);
  const appFeeBps = Number(raw.app_fee_bps ?? 40);
  const maxTotalFeeBps = Number(raw.max_total_fee_bps ?? 500);

  if (!Number.isFinite(appFeeBps) || appFeeBps < 0 || appFeeBps > 500) {
    throw new Error(`Invalid app_fee_bps (${appFeeBps}): must be a finite number between 0 and 500 bps.`);
  }
  if (!Number.isFinite(maxTotalFeeBps) || maxTotalFeeBps < appFeeBps || maxTotalFeeBps > 500) {
    throw new Error(
      `Invalid max_total_fee_bps (${maxTotalFeeBps}): must be >= app_fee_bps (${appFeeBps}) and <= 500 bps.`
    );
  }
  if (!Number.isFinite(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 500) {
    throw new Error(`Invalid max_slippage_bps (${maxSlippageBps}): must be between 0 and 500 bps.`);
  }
  if (
    !Number.isFinite(maxOracleDeviationPercent) ||
    maxOracleDeviationPercent <= 0 ||
    maxOracleDeviationPercent > 5.0
  ) {
    throw new Error(
      `Invalid max_oracle_deviation_percent (${maxOracleDeviationPercent}): must be > 0 and <= 5.0%.`
    );
  }
  if (
    !Number.isFinite(maxSingleTxUsd) ||
    !Number.isFinite(dailySpendLimitUsd) ||
    maxSingleTxUsd <= 0 ||
    dailySpendLimitUsd < maxSingleTxUsd
  ) {
    throw new Error(
      `Invalid spend limits: max_single_tx_usd (${maxSingleTxUsd}) must be > 0 and <= daily_spend_limit_usd (${dailySpendLimitUsd}).`
    );
  }
  if (!Number.isFinite(maxDailyInferenceSpendUsd) || maxDailyInferenceSpendUsd <= 0) {
    throw new Error(`Invalid max_daily_inference_spend_usd (${maxDailyInferenceSpendUsd}): must be > 0.`);
  }
  if (!Number.isFinite(minReportOrTaskPriceUsd) || minReportOrTaskPriceUsd <= 0) {
    throw new Error(`Invalid min_report_or_task_price_usd (${minReportOrTaskPriceUsd}): must be > 0.`);
  }

  const rawSplit = (raw.revenue_split_percentages ?? {}) as Record<string, unknown>;
  const revenueSplit: RevenueSplitConfig = {
    treasury_reserve: Number(rawSplit.treasury_reserve ?? 70),
    sub_agent_bounty_pool: Number(rawSplit.sub_agent_bounty_pool ?? 20),
    compute_refill_pool: Number(rawSplit.compute_refill_pool ?? 10),
  };

  for (const [k, v] of Object.entries(revenueSplit)) {
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error(`Invalid revenue_split_percentages.${k} (${v}): must be between 0 and 100.`);
    }
  }
  const splitSum =
    revenueSplit.treasury_reserve +
    revenueSplit.sub_agent_bounty_pool +
    revenueSplit.compute_refill_pool;
  if (splitSum !== 100) {
    throw new Error(`Invalid revenue_split_percentages: must sum to 100, got ${splitSum}.`);
  }

  const rawLanes = (typeof raw.nep611_gas_key_lanes === "object" && raw.nep611_gas_key_lanes !== null
    ? raw.nep611_gas_key_lanes
    : {}) as Record<string, unknown>;

  const lanesConfig: Nep611LaneConfig = {
    count: Number(rawLanes.count ?? raw.nep611_gas_key_lanes_count ?? 4),
    lane_0: String(rawLanes.lane_0 ?? `scout.${treasuryAccount}`),
    lane_1: String(rawLanes.lane_1 ?? `executor.${treasuryAccount}`),
    lane_2: String(rawLanes.lane_2 ?? `payroll.${treasuryAccount}`),
    lane_3: String(rawLanes.lane_3 ?? `yield.${treasuryAccount}`),
  };

  const allowedTokens = Array.isArray(raw.allowed_tokens)
    ? raw.allowed_tokens.map((t) => String(t))
    : ["USDC", "USDT", "DAI", "NEAR", "wNEAR", "ETH", "WBTC", "SOL", "ZEC"];

  return {
    treasury_account: treasuryAccount,
    emergency_kill_switch: emergencyKillSwitch,
    daily_spend_limit_usd: dailySpendLimitUsd,
    max_single_tx_usd: maxSingleTxUsd,
    max_daily_inference_spend_usd: maxDailyInferenceSpendUsd,
    min_report_or_task_price_usd: minReportOrTaskPriceUsd,
    max_slippage_bps: maxSlippageBps,
    max_oracle_deviation_percent: maxOracleDeviationPercent,
    app_fee_bps: appFeeBps,
    max_total_fee_bps: maxTotalFeeBps,
    limit_order_confidentiality: "basic",
    revenue_split_percentages: revenueSplit,
    nep611_gas_key_lanes_count: lanesConfig.count,
    nep611_gas_key_lanes: lanesConfig,
    allowed_tokens: allowedTokens,
    governance_tiers: raw.governance_tiers as GovernanceTiersConfig | undefined,
    protocol_rules: raw.protocol_rules as ProtocolRulesConfig | undefined,
  };
}

let runtimeKillSwitchOverride: boolean | null = null;

export function setRuntimeKillSwitchOverride(enabled: boolean | null): boolean {
  runtimeKillSwitchOverride = enabled;
  return loadHumanConstraints().emergency_kill_switch;
}

export function getRuntimeKillSwitchOverride(): boolean | null {
  return runtimeKillSwitchOverride;
}

export function loadHumanConstraints(workspaceRoot: string = resolveWorkspaceRoot()): HumanConstraintsConfig {
  const configPath = path.join(workspaceRoot, "config.yaml");
  const base = !fs.existsSync(configPath)
    ? validateHumanConstraints({})
    : validateHumanConstraints((YAML.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>) ?? {});
  if (runtimeKillSwitchOverride !== null) {
    base.emergency_kill_switch = runtimeKillSwitchOverride;
  }
  return base;
}

export function loadKratonConfig(workspaceRoot: string = resolveWorkspaceRoot()): KratonRuntimeConfig {
  return {
    constraints: loadHumanConstraints(workspaceRoot),
    env: loadEnvironmentConfig(workspaceRoot),
    workspaceRoot,
  };
}

