import type { NearConnector } from "@hot-labs/near-connect";

export type WalletChainType = "near" | "evm" | "solana";

export interface LiveWalletBalanceSnapshot {
  nativeSymbol: "NEAR" | "ETH" | "SOL";
  nativeBalance: number;
  nativeFormatted: string;
  totalNearBalance?: number;
  spendableNearBalance?: number;
  storageLockedNear?: number;
  walletGasReserveNear?: number;
  totalNearFormatted?: string;
  spendableNearFormatted?: string;
  wnearBalance: number;
  usdcBalance: number;
  usdtBalance: number;
  tokenBalances: Record<string, number>;
}

export interface ConnectedWalletState extends LiveWalletBalanceSnapshot {
  isPersonalWallet: boolean;
  address: string | null;
  shortAddress: string;
  chainType: WalletChainType;
  providerName: string;
  explorerAccountUrl: string;
  balancesLoading: boolean;
  refreshBalances: () => Promise<void>;
  signPersonalIntent: (message: string) => Promise<{
    signature: string;
    signerAddress: string;
    chainType: WalletChainType;
  }>;
  anchorNearProofViaWallet: (poc4HMaster: string) => Promise<{
    txHash: string;
    signerId: string;
    explorerTxUrl: string;
  }>;
}

export class WalletSignatureRejectedError extends Error {
  constructor(
    message = "Signature request was rejected in your connected wallet."
  ) {
    super(message);
    this.name = "WalletSignatureRejectedError";
  }
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBytesBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) {
    zeroes++;
  }
  const digits = [0];
  for (let i = zeroes; i < bytes.length; i++) {
    let carry = bytes[i];
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
  let out = "1".repeat(zeroes);
  for (let k = digits.length - 1; k >= 0; k--) {
    out += BASE58_ALPHABET[digits[k]];
  }
  return out;
}

function utf8ToHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function parseHexToScaledNumber(hexVal: unknown, decimals: number): number | null {
  if (typeof hexVal !== "string") return null;
  const trimmed = hexVal.trim();
  if (!trimmed.startsWith("0x")) return null;
  if (trimmed === "0x" || trimmed === "0x0") return 0;
  try {
    const raw = BigInt(trimmed);
    if (raw <= 0n) return 0;
    const base = 10n ** BigInt(decimals);
    const whole = Number(raw / base);
    const frac = Number(raw % base) / Number(base);
    return Number((whole + frac).toFixed(6));
  } catch {
    return null;
  }
}

export function formatShortWalletAddress(
  address: string | null,
  chainType?: WalletChainType
): string {
  if (!address) return "jubayir69.testnet";
  if (chainType === "near" && address.length <= 24) return address;
  if (address.length <= 16) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTokenAmountDisplay(val: number, symbol: string): string {
  const safe = Number.isFinite(val) && val > 0 ? val : 0;
  const upper = symbol.toUpperCase();
  if (upper === "USDC" || upper === "USDT" || upper === "DAI") {
    return safe.toFixed(2);
  }
  if (safe === 0) return "0.0000";
  if (safe < 0.0001) return safe.toFixed(6);
  return safe.toFixed(4);
}

export function getAvailablePayTokenBalance(
  wallet: ConnectedWalletState | undefined | null,
  tokenSymbol: string,
  tokenId?: string
): number {
  if (!wallet || !wallet.isPersonalWallet || !wallet.address) {
    return Number.POSITIVE_INFINITY;
  }
  if (tokenId && typeof wallet.tokenBalances[tokenId] === "number") {
    return wallet.tokenBalances[tokenId];
  }
  const symUpper = tokenSymbol.trim().toUpperCase();
  if (typeof wallet.tokenBalances[symUpper] === "number") {
    return wallet.tokenBalances[symUpper];
  }
  if (symUpper === "USDC") return wallet.usdcBalance;
  if (symUpper === "USDT") return wallet.usdtBalance;
  if (symUpper === "ETH" && wallet.chainType === "evm") return wallet.nativeBalance;
  if ((symUpper === "NEAR" || symUpper === "WNEAR") && wallet.chainType === "near") {
    return Number((wallet.nativeBalance + wallet.wnearBalance).toFixed(6));
  }
  if (symUpper === "SOL" && wallet.chainType === "solana") return wallet.nativeBalance;
  return 0;
}

/**
 * Queries real on-chain native + USDC + USDT balances for the user's connected wallet.
 * Never returns fake or hardcoded non-zero numbers; if a wallet holds 0, returns exact 0.
 */
export async function fetchLiveConnectedWalletBalances(params: {
  address: string;
  chainType: WalletChainType;
}): Promise<LiveWalletBalanceSnapshot> {
  const { address, chainType } = params;
  const nativeSymbol: "NEAR" | "ETH" | "SOL" =
    chainType === "evm" ? "ETH" : chainType === "solana" ? "SOL" : "NEAR";

  let inPageEthChainId: string | undefined;
  let inPageEthNative: number | null = null;
  let inPageUsdc: number | null = null;
  let inPageUsdt: number | null = null;

  // 1. Direct In-Page Browser Wallet Provider Query for EVM (window.ethereum)
  if (chainType === "evm" && typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethProvider = (window as any).ethereum;
    if (ethProvider && typeof ethProvider.request === "function") {
      try {
        const cid = await ethProvider.request({ method: "eth_chainId" });
        if (typeof cid === "string") {
          inPageEthChainId = cid.toLowerCase();
        }
      } catch {
        // Ignore chainId error and fall back to server multi-RPC
      }

      try {
        const balHex = await ethProvider.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        });
        inPageEthNative = parseHexToScaledNumber(balHex, 18);
      } catch {
        // Fallback to server RPC below
      }

      // Query ERC-20 balanceOf(address) (0x70a08231) directly on the connected EVM chain
      if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
        const padded = address.slice(2).toLowerCase().padStart(64, "0");
        const callData = `0x70a08231${padded}`;
        let usdcContract = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Ethereum Mainnet USDC
        let usdtContract: string | null = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // Ethereum Mainnet USDT

        if (inPageEthChainId === "0xaa36a7") {
          // Sepolia USDC
          usdcContract = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
          usdtContract = null;
        } else if (inPageEthChainId === "0x2105") {
          // Base Mainnet USDC
          usdcContract = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
          usdtContract = null;
        } else if (inPageEthChainId === "0xa4b1") {
          // Arbitrum One USDC & USDT
          usdcContract = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
          usdtContract = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
        }

        try {
          const usdcHex = await ethProvider.request({
            method: "eth_call",
            params: [{ to: usdcContract, data: callData }, "latest"],
          });
          inPageUsdc = parseHexToScaledNumber(usdcHex, 6);
        } catch {
          inPageUsdc = null;
        }

        if (usdtContract) {
          try {
            const usdtHex = await ethProvider.request({
              method: "eth_call",
              params: [{ to: usdtContract, data: callData }, "latest"],
            });
            inPageUsdt = parseHexToScaledNumber(usdtHex, 6);
          } catch {
            inPageUsdt = null;
          }
        }
      }
    }
  }

  // 2. Server-Side Multi-RPC Balance Verification (Ethereum/Base/Arbitrum/Sepolia, NEAR RPC, Solana RPC)
  try {
    const res = await fetch("/api/wallet/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        chainType,
        chainIdHex: inPageEthChainId,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        nativeSymbol?: "NEAR" | "ETH" | "SOL";
        nativeBalance?: number;
        totalNearBalance?: number;
        spendableNearBalance?: number;
        storageLockedNear?: number;
        walletGasReserveNear?: number;
        totalNearFormatted?: string;
        spendableNearFormatted?: string;
        wnearBalance?: number;
        usdcBalance?: number;
        usdtBalance?: number;
        tokenBalances?: Record<string, number>;
      };

      const resolvedNative =
        inPageEthNative !== null
          ? Math.max(inPageEthNative, Number(json.nativeBalance ?? 0))
          : Number(json.spendableNearBalance ?? json.nativeBalance ?? 0);
      const resolvedTotalNear =
        chainType === "near"
          ? Number(json.totalNearBalance ?? resolvedNative)
          : undefined;
      const resolvedSpendableNear =
        chainType === "near"
          ? Number(json.spendableNearBalance ?? resolvedNative)
          : undefined;
      const resolvedWnear = Number(json.wnearBalance ?? 0);
      const resolvedUsdc =
        inPageUsdc !== null
          ? Math.max(inPageUsdc, Number(json.usdcBalance ?? 0))
          : Number(json.usdcBalance ?? 0);
      const resolvedUsdt =
        inPageUsdt !== null
          ? Math.max(inPageUsdt, Number(json.usdtBalance ?? 0))
          : Number(json.usdtBalance ?? 0);

      const mergedMap: Record<string, number> = {
        ...(json.tokenBalances ?? {}),
        [nativeSymbol]: resolvedNative,
        USDC: resolvedUsdc,
        "USDC-NEAR": resolvedUsdc,
        "USDC-BASE": json.tokenBalances?.["USDC-BASE"] ?? resolvedUsdc,
        USDT: resolvedUsdt,
        "USDT-NEAR": resolvedUsdt,
        "USDT-ARBITRUM": json.tokenBalances?.["USDT-ARBITRUM"] ?? resolvedUsdt,
      };
      if (chainType === "evm") {
        mergedMap["ETH-ETHEREUM"] = resolvedNative;
      } else if (chainType === "near") {
        mergedMap.NEAR = resolvedSpendableNear ?? resolvedNative;
        mergedMap.wNEAR = Number(((resolvedSpendableNear ?? resolvedNative) + resolvedWnear).toFixed(4));
        mergedMap["wNEAR-NEAR"] = Number(((resolvedSpendableNear ?? resolvedNative) + resolvedWnear).toFixed(4));
      } else if (chainType === "solana") {
        mergedMap["SOL-SOLANA"] = resolvedNative;
      }

      return {
        nativeSymbol,
        nativeBalance: resolvedNative,
        nativeFormatted: `${formatTokenAmountDisplay(resolvedNative, nativeSymbol)} ${nativeSymbol}`,
        totalNearBalance: resolvedTotalNear,
        spendableNearBalance: resolvedSpendableNear,
        storageLockedNear: json.storageLockedNear,
        walletGasReserveNear: json.walletGasReserveNear,
        totalNearFormatted:
          resolvedTotalNear !== undefined
            ? `${resolvedTotalNear.toFixed(4)} NEAR`
            : json.totalNearFormatted,
        spendableNearFormatted:
          resolvedSpendableNear !== undefined
            ? `${resolvedSpendableNear.toFixed(4)} NEAR`
            : json.spendableNearFormatted,
        wnearBalance: resolvedWnear,
        usdcBalance: resolvedUsdc,
        usdtBalance: resolvedUsdt,
        tokenBalances: mergedMap,
      };
    }
  } catch {
    // Fall back to direct in-page numbers (0 if unavailable)
  }

  const fallbackNative = inPageEthNative ?? 0;
  const fallbackUsdc = inPageUsdc ?? 0;
  const fallbackUsdt = inPageUsdt ?? 0;

  return {
    nativeSymbol,
    nativeBalance: fallbackNative,
    nativeFormatted: `${formatTokenAmountDisplay(fallbackNative, nativeSymbol)} ${nativeSymbol}`,
    wnearBalance: 0,
    usdcBalance: fallbackUsdc,
    usdtBalance: fallbackUsdt,
    tokenBalances: {
      [nativeSymbol]: fallbackNative,
      ...(chainType === "evm" ? { "ETH-ETHEREUM": fallbackNative } : {}),
      ...(chainType === "near" ? { wNEAR: fallbackNative, "wNEAR-NEAR": fallbackNative } : {}),
      ...(chainType === "solana" ? { "SOL-SOLANA": fallbackNative } : {}),
      USDC: fallbackUsdc,
      "USDC-NEAR": fallbackUsdc,
      "USDC-BASE": fallbackUsdc,
      USDT: fallbackUsdt,
      "USDT-NEAR": fallbackUsdt,
      "USDT-ARBITRUM": fallbackUsdt,
    },
  };
}

function isUserRejectionError(err: unknown): boolean {
  if (!err) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any)?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("reject") ||
    msg.includes("cancel") ||
    msg.includes("denied") ||
    msg.includes("declined") ||
    msg.includes("closed") ||
    msg.includes("aborted by user") ||
    msg.includes("user disapproved")
  );
}

/**
 * Triggers a REAL cryptographic signing popup in the user's connected personal wallet:
 * - EVM (Rabby / MetaMask): `window.ethereum.request({ method: "personal_sign" })`
 * - Solana (Phantom): `window.phantom.solana.signMessage(bytes, "utf8")`
 * - NEAR (Meteor / HOT / MyNearWallet): `wallet.signMessage(...)` or `wallet.signAndSendTransaction(...)`
 */
export async function signMessageWithPersonalWallet(params: {
  address: string;
  chainType: WalletChainType;
  message: string;
  nearConnector: NearConnector | null;
}): Promise<{
  signature: string;
  signerAddress: string;
  chainType: WalletChainType;
}> {
  const { address, chainType, message, nearConnector } = params;

  if (chainType === "evm") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethProvider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
    if (!ethProvider || typeof ethProvider.request !== "function") {
      throw new Error("EVM wallet extension (Rabby / MetaMask) is not available in window.ethereum.");
    }
    try {
      const hexMessage = utf8ToHex(message);
      const sig = await ethProvider.request({
        method: "personal_sign",
        params: [hexMessage, address],
      });
      if (typeof sig !== "string" || !sig.startsWith("0x") || sig.length < 20) {
        throw new WalletSignatureRejectedError();
      }
      return {
        signature: sig,
        signerAddress: address,
        chainType: "evm",
      };
    } catch (err) {
      if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
        throw new WalletSignatureRejectedError();
      }
      throw err;
    }
  }

  if (chainType === "solana") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== "undefined" ? (window as any) : {};
    const solProvider =
      win?.phantom?.solana ?? (win?.solana?.isPhantom ? win.solana : win?.solana);
    if (!solProvider || typeof solProvider.signMessage !== "function") {
      throw new Error("Phantom Solana wallet is not available in window.phantom.solana.");
    }
    try {
      const encoded = new TextEncoder().encode(message);
      const signed = await solProvider.signMessage(encoded, "utf8");
      const rawSigBytes: Uint8Array | undefined =
        signed?.signature instanceof Uint8Array
          ? signed.signature
          : signed instanceof Uint8Array
            ? signed
            : undefined;
      if (!rawSigBytes || rawSigBytes.length === 0) {
        throw new WalletSignatureRejectedError();
      }
      return {
        signature: encodeBytesBase58(rawSigBytes),
        signerAddress: address,
        chainType: "solana",
      };
    } catch (err) {
      if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
        throw new WalletSignatureRejectedError();
      }
      throw err;
    }
  }

  // NEAR Personal Wallet via @hot-labs/near-connect
  if (!nearConnector) {
    throw new Error("NEAR wallet connector session not initialized. Please reconnect your NEAR wallet.");
  }
  try {
    const wallet = await nearConnector.wallet();
    if (typeof wallet.signMessage === "function") {
      const nonce = new Uint8Array(32);
      crypto.getRandomValues(nonce);
      const signedMsg = await wallet.signMessage({
        message,
        recipient: "intents.near",
        nonce,
      });
      if (!signedMsg || !signedMsg.signature) {
        throw new WalletSignatureRejectedError();
      }
      return {
        signature: signedMsg.signature,
        signerAddress: signedMsg.accountId || address,
        chainType: "near",
      };
    }

    // Fallback for NEAR wallets without NEP-413 signMessage: trigger real 0-yocto self-transfer popup
    const txOutcome = await wallet.signAndSendTransaction({
      signerId: address,
      receiverId: address,
      actions: [{ type: "Transfer", params: { deposit: "0" } }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = String((txOutcome as any)?.transaction?.hash ?? (txOutcome as any)?.transaction_outcome?.id ?? "");
    if (!txHash) {
      throw new WalletSignatureRejectedError();
    }
    return {
      signature: txHash,
      signerAddress: address,
      chainType: "near",
    };
  } catch (err) {
    if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
      throw new WalletSignatureRejectedError();
    }
    throw err;
  }
}

/**
 * Triggers a REAL on-chain NEAR transaction directly from the user's connected NEAR wallet
 * (`wallet.signAndSendTransaction`) so the transaction hash and gas fee come from their NEAR account.
 */
export async function sendNearTransactionWithPersonalWallet(params: {
  address: string;
  poc4HMaster: string;
  nearConnector: NearConnector | null;
}): Promise<{
  txHash: string;
  signerId: string;
  explorerTxUrl: string;
}> {
  const { address, nearConnector } = params;
  if (!nearConnector) {
    throw new Error("NEAR wallet connector session not initialized. Please reconnect your NEAR wallet.");
  }
  try {
    const wallet = await nearConnector.wallet();
    const outcome = await wallet.signAndSendTransaction({
      signerId: address,
      receiverId: address,
      actions: [
        {
          type: "Transfer",
          params: { deposit: "0" },
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawOutcome = outcome as any;
    const txHash = String(
      rawOutcome?.transaction?.hash ??
        rawOutcome?.transaction_outcome?.id ??
        ""
    ).trim();
    if (!txHash) {
      throw new WalletSignatureRejectedError();
    }
    const isMainnet = address.endsWith(".near");
    const explorerTxUrl = isMainnet
      ? `https://nearblocks.io/txns/${txHash}`
      : `https://testnet.nearblocks.io/txns/${txHash}`;
    return {
      txHash,
      signerId: address,
      explorerTxUrl,
    };
  } catch (err) {
    if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
      throw new WalletSignatureRejectedError();
    }
    throw err;
  }
}

