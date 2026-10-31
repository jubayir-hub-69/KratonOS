import crypto from "node:crypto";
import { loadEnvironmentConfig } from "./config.js";

// ============================================================================
// Single-Request NEAR JSON-RPC 2.0 Client with Round-Robin Failover
// Protocol Rule: nearcore JSON-RPC does NOT support batching.
// Every HTTP POST sends strictly ONE JSON-RPC 2.0 request object.
// ============================================================================

export const CACHE_TTL_SECONDS = 1800; // 30-minute TTL cache for NEP-141 storage_balance_of

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown> | unknown[];
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string;
  result?: T;
  error?: JsonRpcError;
}

export interface NearAccountView {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;
  storage_paid_at: number;
  block_height: number;
  block_hash: string;
}

export interface FunctionCallPermissionView {
  FunctionCall: {
    allowance: string | null;
    receiver_id: string;
    method_names: string[];
  };
}

export type AccessKeyPermissionView = "FullAccess" | FunctionCallPermissionView;

export interface AccessKeyView {
  nonce: number;
  permission: AccessKeyPermissionView;
  gas_key_balance?: string;
  gas_key_nonces?: number[];
}

export interface AccessKeyInfoView {
  public_key: string;
  access_key: AccessKeyView;
}

export interface AccessKeyListView {
  keys: AccessKeyInfoView[];
  block_height: number;
  block_hash: string;
}

export interface GasPriceView {
  gas_price: string;
}

export interface NetworkStatusView {
  chain_id: string;
  latest_protocol_version: number;
  protocol_version: number;
  rpc_addr?: string;
  sync_info: {
    latest_block_hash: string;
    latest_block_height: number;
    latest_block_time: string;
    latest_state_root: string;
    syncing: boolean;
  };
  validator_account_id?: string | null;
}

export interface GasKeyNoncesResult {
  accountId: string;
  publicKey: string;
  isNativeGasKey: boolean;
  nonces: [bigint, bigint, bigint, bigint];
  prepaidBalanceYocto: string;
  blockHeight: number;
  blockHash: string;
}

export interface Nep141StorageBalance {
  total: string;
  available: string;
}

interface StorageCacheEntry {
  balance: Nep141StorageBalance | null;
  expiresAtMs: number;
}

export class NearRpcClient {
  private readonly endpoints: string[];
  private currentIndex = 0;
  private readonly timeoutMs: number;
  private readonly storageCache = new Map<string, StorageCacheEntry>();

  constructor(endpoints?: string[], timeoutMs = 8000) {
    const env = loadEnvironmentConfig();
    this.endpoints =
      endpoints && endpoints.length > 0
        ? endpoints
        : env.NEAR_FALLBACK_RPC_URLS.length > 0
          ? env.NEAR_FALLBACK_RPC_URLS
          : ["https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"];
    this.timeoutMs = timeoutMs;
  }

  public getEndpoints(): string[] {
    return [...this.endpoints];
  }

  /**
   * Sends a single non-batched JSON-RPC 2.0 POST request with round-robin endpoint failover.
   */
  public async sendSingleRpc<T = unknown>(
    method: string,
    params: Record<string, unknown> | unknown[]
  ): Promise<{ result: T; endpointUsed: string }> {
    // Enforce non-batching invariant: payload is always a single JSON-RPC 2.0 object
    const requestPayload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: `kraton-${crypto.randomUUID()}`,
      method,
      params,
    };

    if (Array.isArray(requestPayload)) {
      throw new Error("Protocol Violation: nearcore JSON-RPC batch arrays are strictly prohibited.");
    }

    const errors: string[] = [];
    const totalEndpoints = this.endpoints.length;

    for (let attempt = 0; attempt < totalEndpoints; attempt++) {
      const endpointIndex = (this.currentIndex + attempt) % totalEndpoints;
      const endpoint = this.endpoints[endpointIndex];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          errors.push(`[${endpoint}] HTTP ${response.status} ${response.statusText}`);
          continue;
        }

        const json = (await response.json()) as JsonRpcResponse<T>;
        if (json.error) {
          // If it's a deterministic chain error (e.g. UNKNOWN_ACCOUNT or UNKNOWN_ACCESS_KEY), propagate with context
          const errDataStr = json.error.data ? JSON.stringify(json.error.data) : "";
          const errMsg = `[${endpoint}] RPC Error ${json.error.code}: ${json.error.message} ${errDataStr}`.trim();
          if (
            errDataStr.includes("UNKNOWN_ACCOUNT") ||
            errDataStr.includes("UNKNOWN_ACCESS_KEY") ||
            errDataStr.includes("MethodNotFound") ||
            json.error.code === -32601
          ) {
            throw new Error(errMsg);
          }
          errors.push(errMsg);
          continue;
        }

        if (json.result === undefined) {
          errors.push(`[${endpoint}] Empty RPC result for method ${method}`);
          continue;
        }

        // Advance round-robin pointer to the healthy endpoint
        this.currentIndex = endpointIndex;
        return { result: json.result, endpointUsed: endpoint };
      } catch (err) {
        clearTimeout(timer);
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes("UNKNOWN_ACCOUNT") ||
          message.includes("UNKNOWN_ACCESS_KEY") ||
          message.includes("MethodNotFound") ||
          message.includes("-32601")
        ) {
          throw err;
        }
        errors.push(`[${endpoint}] ${message}`);
      }
    }

    throw new Error(`All NEAR RPC endpoints failed for method '${method}': ${errors.join(" | ")}`);
  }

  /**
   * Queries account state via `query` -> `view_account`.
   */
  public async viewAccount(accountId: string): Promise<NearAccountView> {
    const { result } = await this.sendSingleRpc<NearAccountView>("query", {
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
    return result;
  }

  /**
   * Lists all access keys on an account via `EXPERIMENTAL_view_access_key_list` (or `view_access_key_list`).
   */
  public async viewAccessKeyList(accountId: string): Promise<AccessKeyListView> {
    try {
      const { result } = await this.sendSingleRpc<AccessKeyListView>("EXPERIMENTAL_view_access_key_list", {
        finality: "final",
        account_id: accountId,
      });
      return result;
    } catch {
      const { result } = await this.sendSingleRpc<AccessKeyListView>("query", {
        request_type: "view_access_key_list",
        finality: "final",
        account_id: accountId,
      });
      return result;
    }
  }

  /**
   * Queries a single access key via `query` -> `view_access_key`.
   */
  public async viewAccessKey(
    accountId: string,
    publicKey: string
  ): Promise<AccessKeyView & { block_height: number; block_hash: string }> {
    const { result } = await this.sendSingleRpc<AccessKeyView & { block_height: number; block_hash: string }>(
      "query",
      {
        request_type: "view_access_key",
        finality: "final",
        account_id: accountId,
        public_key: publicKey,
      }
    );
    return result;
  }

  /**
   * Queries NEP-611 gas-key parallel nonces (`view_gas_key_nonces`), with graceful fallback
   * to standard access key nonce partitioning if the key is a standard key or the RPC endpoint
   * does not yet expose `view_gas_key_nonces`.
   */
  public async viewGasKeyNonces(accountId: string, publicKey?: string): Promise<GasKeyNoncesResult> {
    let targetPublicKey = publicKey;
    if (!targetPublicKey) {
      const keyList = await this.viewAccessKeyList(accountId);
      if (keyList.keys.length === 0) {
        throw new Error(`Account ${accountId} has no access keys on-chain.`);
      }
      targetPublicKey = keyList.keys[0].public_key;
    }

    try {
      const { result } = await this.sendSingleRpc<{
        nonces: Array<number | string>;
        balance?: string;
        block_height: number;
        block_hash: string;
      }>("view_gas_key_nonces", {
        finality: "final",
        account_id: accountId,
        public_key: targetPublicKey,
      });

      if (Array.isArray(result.nonces) && result.nonces.length >= 4) {
        return {
          accountId,
          publicKey: targetPublicKey,
          isNativeGasKey: true,
          nonces: [
            BigInt(result.nonces[0]),
            BigInt(result.nonces[1]),
            BigInt(result.nonces[2]),
            BigInt(result.nonces[3]),
          ],
          prepaidBalanceYocto: result.balance ?? "0",
          blockHeight: result.block_height,
          blockHash: result.block_hash,
        };
      }
    } catch {
      // Fallback to `view_access_key` and derive isolated lane nonce ranges
    }

    const keyView = await this.viewAccessKey(accountId, targetPublicKey);
    const baseNonce = BigInt(keyView.nonce);
    // Partition into 4 non-overlapping NEP-611 lane nonce subspaces
    const stride = 1_000_000n;
    return {
      accountId,
      publicKey: targetPublicKey,
      isNativeGasKey: Array.isArray(keyView.gas_key_nonces),
      nonces: [
        baseNonce + 1n,
        baseNonce + stride + 1n,
        baseNonce + stride * 2n + 1n,
        baseNonce + stride * 3n + 1n,
      ],
      prepaidBalanceYocto: keyView.gas_key_balance ?? "0",
      blockHeight: keyView.block_height,
      blockHash: keyView.block_hash,
    };
  }

  /**
   * Calls a read-only smart contract view method (`query` -> `call_function`),
   * encoding `args` in Base64 and parsing the UTF-8 JSON byte array response.
   */
  public async callViewFunction<T = unknown>(
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const argsBase64 = Buffer.from(JSON.stringify(args), "utf8").toString("base64");
    const { result } = await this.sendSingleRpc<{
      result: number[];
      logs: string[];
      block_height: number;
      block_hash: string;
    }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: methodName,
      args_base64: argsBase64,
    });

    const decodedText = Buffer.from(result.result).toString("utf8");
    return JSON.parse(decodedText) as T;
  }

  /**
   * Fetches live network gas price (`gas_price`).
   */
  public async getGasPrice(blockId: string | number | null = null): Promise<GasPriceView> {
    const { result } = await this.sendSingleRpc<GasPriceView>("gas_price", [blockId]);
    return result;
  }

  /**
   * Fetches live node & chain status (`status`).
   */
  public async getNetworkStatus(): Promise<NetworkStatusView> {
    const { result } = await this.sendSingleRpc<NetworkStatusView>("status", []);
    return result;
  }

  /**
   * Fetches live protocol configuration (`EXPERIMENTAL_protocol_config`).
   */
  public async getProtocolConfig(): Promise<Record<string, unknown>> {
    const { result } = await this.sendSingleRpc<Record<string, unknown>>("EXPERIMENTAL_protocol_config", {
      finality: "final",
    });
    return result;
  }

  /**
   * Fetches live chunk congestion level (`EXPERIMENTAL_congestion_level`).
   */
  public async getCongestionLevel(chunkHash?: string): Promise<{ congestion_level: number; chunk_hash: string }> {
    let targetChunkHash = chunkHash;
    if (!targetChunkHash) {
      const { result: block } = await this.sendSingleRpc<{
        chunks: Array<{ chunk_hash: string }>;
      }>("block", { finality: "final" });
      targetChunkHash = block.chunks?.[0]?.chunk_hash ?? "";
    }

    try {
      const { result } = await this.sendSingleRpc<{ congestion_level: number }>(
        "EXPERIMENTAL_congestion_level",
        { chunk_id: targetChunkHash }
      );
      return {
        congestion_level: Number(result.congestion_level ?? 0),
        chunk_hash: targetChunkHash,
      };
    } catch {
      return {
        congestion_level: 0,
        chunk_hash: targetChunkHash,
      };
    }
  }

  /**
   * Checks NEP-141 `storage_balance_of` for an account on a token contract,
   * backed by a 30-minute TTL in-memory cache (`CACHE_TTL_SECONDS = 1800`).
   */
  public async checkStorageBalance(
    tokenContractId: string,
    accountId: string,
    bypassCache = false
  ): Promise<{ balance: Nep141StorageBalance | null; fromCache: boolean }> {
    const cacheKey = `${tokenContractId}::${accountId}`;
    const now = Date.now();

    if (!bypassCache) {
      const cached = this.storageCache.get(cacheKey);
      if (cached && cached.expiresAtMs > now) {
        return { balance: cached.balance, fromCache: true };
      }
    }

    const balance = await this.callViewFunction<Nep141StorageBalance | null>(
      tokenContractId,
      "storage_balance_of",
      { account_id: accountId }
    );

    this.storageCache.set(cacheKey, {
      balance,
      expiresAtMs: now + CACHE_TTL_SECONDS * 1000,
    });

    return { balance, fromCache: false };
  }
}

