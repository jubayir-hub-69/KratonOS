import type { NearConnector } from "@hot-labs/near-connect";

export type WalletChainType =
  | "near"
  | "evm"
  | "solana"
  | "bitcoin"
  | "sui"
  | "ton"
  | "xrp";

export type WalletNativeSymbol =
  | "NEAR"
  | "ETH"
  | "SOL"
  | "BTC"
  | "SUI"
  | "TON"
  | "XRP";

export interface ChainFamilyMetadata {
  chainType: WalletChainType;
  label: string;
  shortLabel: string;
  nativeSymbol: WalletNativeSymbol;
  recommendedWallets: string;
  extensionHint: string;
  badgeTone: "emerald" | "sky" | "amber";
}

export const ALL_WALLET_CHAINS: WalletChainType[] = [
  "near",
  "evm",
  "solana",
  "bitcoin",
  "sui",
  "ton",
  "xrp",
];

export const CHAIN_FAMILY_META: Record<WalletChainType, ChainFamilyMetadata> = {
  near: {
    chainType: "near",
    label: "NEAR Protocol",
    shortLabel: "NEAR",
    nativeSymbol: "NEAR",
    recommendedWallets: "Meteor / HOT / Nightly / MyNearWallet",
    extensionHint: "@hot-labs/near-connect selector (Meteor, HOT, Nightly, MyNearWallet)",
    badgeTone: "emerald",
  },
  evm: {
    chainType: "evm",
    label: "Ethereum / EVM",
    shortLabel: "EVM",
    nativeSymbol: "ETH",
    recommendedWallets: "Rabby / MetaMask / Brave EVM",
    extensionHint: "window.ethereum (EIP-1193 Rabby, MetaMask, Brave, Coinbase)",
    badgeTone: "sky",
  },
  solana: {
    chainType: "solana",
    label: "Solana",
    shortLabel: "Solana",
    nativeSymbol: "SOL",
    recommendedWallets: "Phantom / Solflare",
    extensionHint: "window.phantom.solana / window.solflare",
    badgeTone: "emerald",
  },
  bitcoin: {
    chainType: "bitcoin",
    label: "Bitcoin / UTXO",
    shortLabel: "Bitcoin",
    nativeSymbol: "BTC",
    recommendedWallets: "UniSat / Xverse",
    extensionHint: "window.unisat / window.XverseProviders",
    badgeTone: "amber",
  },
  sui: {
    chainType: "sui",
    label: "Sui Network",
    shortLabel: "Sui",
    nativeSymbol: "SUI",
    recommendedWallets: "Slush / Sui Wallet / Nightly",
    extensionHint: "@mysten/wallet-standard (Slush, Sui Wallet, Nightly, Surf)",
    badgeTone: "sky",
  },
  ton: {
    chainType: "ton",
    label: "TON Network",
    shortLabel: "TON",
    nativeSymbol: "TON",
    recommendedWallets: "Tonkeeper / TON Wallet",
    extensionHint: "window.ton / window.tonkeeper",
    badgeTone: "sky",
  },
  xrp: {
    chainType: "xrp",
    label: "XRP Ledger",
    shortLabel: "XRP",
    nativeSymbol: "XRP",
    recommendedWallets: "Crossmark / GemWallet",
    extensionHint: "window.crossmark / window.gemWallet / window.xrpl",
    badgeTone: "amber",
  },
};

export function getTokenChainFamily(
  tokenId: string,
  tokenSymbol?: string
): WalletChainType {
  const idUpper = (tokenId || "").trim().toUpperCase();
  if (
    idUpper === "USDC-NEAR" ||
    idUpper === "USDT-NEAR" ||
    idUpper === "WNEAR-NEAR" ||
    idUpper === "NEAR-NEAR" ||
    idUpper === "NEAR"
  ) {
    return "near";
  }
  if (
    idUpper === "ETH-ETHEREUM" ||
    idUpper === "USDC-BASE" ||
    idUpper === "USDT-ARBITRUM" ||
    idUpper === "AVAX-AVALANCHE" ||
    idUpper === "BNB-BNB"
  ) {
    return "evm";
  }
  if (idUpper === "SOL-SOLANA") {
    return "solana";
  }
  if (
    idUpper === "BTC-BITCOIN" ||
    idUpper === "DOGE-DOGECOIN" ||
    idUpper === "ZEC-ZCASH"
  ) {
    return "bitcoin";
  }
  if (idUpper === "SUI-SUI") {
    return "sui";
  }
  if (idUpper === "TON-TON") {
    return "ton";
  }
  if (idUpper === "XRP-RIPPLE") {
    return "xrp";
  }

  const symUpper = (tokenSymbol || tokenId || "").trim().toUpperCase();
  if (symUpper === "NEAR" || symUpper === "WNEAR") return "near";
  if (symUpper === "ETH" || symUpper === "AVAX" || symUpper === "BNB") return "evm";
  if (symUpper === "SOL") return "solana";
  if (
    symUpper === "BTC" ||
    symUpper === "WBTC" ||
    symUpper === "DOGE" ||
    symUpper === "ZEC"
  ) {
    return "bitcoin";
  }
  if (symUpper === "SUI") return "sui";
  if (symUpper === "TON") return "ton";
  if (symUpper === "XRP") return "xrp";
  return "near";
}

export const SUPPORTED_EVM_TESTNET_CHAIN_IDS = new Set([
  "0xaa36a7", // Ethereum Sepolia (11155111)
  "0x66eee",  // Arbitrum Sepolia (421614)
  "0x14a34",  // Base Sepolia (84532)
]);

export function isBitcoinTestnetAddress(address: string): boolean {
  const clean = (address || "").trim();
  return (
    clean.startsWith("tb1") ||
    clean.startsWith("m") ||
    clean.startsWith("n") ||
    clean.startsWith("2")
  );
}

export function evaluateWalletNetworkMismatch(params: {
  chainType: WalletChainType;
  address: string;
  evmChainIdHex?: string;
  suiActiveChain?: string;
  xrpNetworkType?: string;
}): { isMainnetMismatch: boolean; reason?: string } {
  const { chainType, address, evmChainIdHex, suiActiveChain, xrpNetworkType } = params;
  const cleanAddr = (address || "").trim();

  if (chainType === "near") {
    if (cleanAddr.toLowerCase().endsWith(".near")) {
      return {
        isMainnetMismatch: true,
        reason: `[TESTNET MODE REQUIRED] Connected NEAR account (${cleanAddr}) is on Mainnet. Please switch your wallet to Testnet mode (.testnet) to continue.`,
      };
    }
    return { isMainnetMismatch: false };
  }

  if (chainType === "evm") {
    const cid = (evmChainIdHex || "").trim().toLowerCase();
    if (cid && !SUPPORTED_EVM_TESTNET_CHAIN_IDS.has(cid)) {
      return {
        isMainnetMismatch: true,
        reason:
          "[TESTNET MODE REQUIRED] Your EVM wallet is currently on Mainnet. Please switch to Testnet mode (Sepolia / Arbitrum Sepolia / Base Sepolia) to execute.",
      };
    }
    return { isMainnetMismatch: false };
  }

  if (chainType === "bitcoin") {
    if (cleanAddr && !isBitcoinTestnetAddress(cleanAddr)) {
      return {
        isMainnetMismatch: true,
        reason: `[TESTNET MODE REQUIRED] Your Bitcoin wallet is on Mainnet (${cleanAddr}). Please switch UniSat/Xverse to Bitcoin Testnet mode (tb1...).`,
      };
    }
    return { isMainnetMismatch: false };
  }

  if (chainType === "sui") {
    const sc = (suiActiveChain || "").trim().toLowerCase();
    if (sc === "sui:mainnet" || sc === "mainnet") {
      return {
        isMainnetMismatch: true,
        reason:
          "[TESTNET MODE REQUIRED] Please switch Slush / Sui Wallet to Sui Testnet mode.",
      };
    }
    return { isMainnetMismatch: false };
  }

  if (chainType === "ton") {
    if (cleanAddr.startsWith("EQ") || cleanAddr.startsWith("UQ")) {
      return {
        isMainnetMismatch: true,
        reason: `[TESTNET MODE REQUIRED] Connected TON address (${cleanAddr}) is on Mainnet. Please switch wallet to Testnet mode (0Q... / kQ...).`,
      };
    }
    return { isMainnetMismatch: false };
  }

  if (chainType === "xrp") {
    const xn = (xrpNetworkType || "").trim().toLowerCase();
    if (xn.includes("main") || xn.includes("live")) {
      return {
        isMainnetMismatch: true,
        reason:
          "[TESTNET MODE REQUIRED] Connected XRPL wallet is on Mainnet. Please switch wallet to Testnet mode.",
      };
    }
    return { isMainnetMismatch: false };
  }

  return { isMainnetMismatch: false };
}

export async function requestBrowserWalletTestnetSwitch(
  chainType: WalletChainType
): Promise<{ switched: boolean; newAddress?: string }> {
  if (typeof window === "undefined") {
    return { switched: false };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;

  if (chainType === "evm") {
    const ethProvider = win.ethereum;
    if (!ethProvider || typeof ethProvider.request !== "function") {
      return { switched: false };
    }
    try {
      await ethProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
      return { switched: true };
    } catch (switchErr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errCode = (switchErr as any)?.code;
      if (errCode === 4902) {
        try {
          await ethProvider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0xaa36a7",
                chainName: "Sepolia Testnet",
                nativeCurrency: {
                  name: "Sepolia ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
          return { switched: true };
        } catch {
          return { switched: false };
        }
      }
      return { switched: false };
    }
  }

  if (chainType === "bitcoin" && win.unisat) {
    try {
      if (typeof win.unisat.switchNetwork === "function") {
        await win.unisat.switchNetwork("testnet");
      } else if (typeof win.unisat.switchChain === "function") {
        await win.unisat.switchChain("BITCOIN_TESTNET");
      }
      const accounts =
        typeof win.unisat.requestAccounts === "function"
          ? await win.unisat.requestAccounts()
          : typeof win.unisat.getAccounts === "function"
            ? await win.unisat.getAccounts()
            : [];
      const addr = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : "";
      if (addr && isBitcoinTestnetAddress(addr)) {
        return { switched: true, newAddress: addr };
      }
    } catch {
      return { switched: false };
    }
  }

  return { switched: false };
}

export interface WalletExplorerTxInfo {
  url: string;
  buttonLabel: string;
  hashLabel: string;
  explorerName: string;
}

export function getWalletExplorerTxInfo(
  txHash: string,
  chainType?: WalletChainType | string,
  detectedNetwork?: string
): WalletExplorerTxInfo {
  const cleanHash = String(txHash || "").trim();
  const normChain = String(chainType || "near").trim().toLowerCase();
  const netLower = String(detectedNetwork || "").toLowerCase();

  if (
    normChain === "evm" ||
    normChain.includes("eth") ||
    normChain.includes("base") ||
    normChain.includes("arbitrum") ||
    (cleanHash.startsWith("0x") && normChain !== "sui")
  ) {
    if (netLower.includes("base sepolia") || normChain.includes("base")) {
      return {
        url: `https://sepolia.basescan.org/tx/${cleanHash}`,
        buttonLabel: "View on Etherscan",
        hashLabel: "Base Sepolia Settlement TxHash:",
        explorerName: "Etherscan",
      };
    }
    if (netLower.includes("arbitrum sepolia") || normChain.includes("arbitrum")) {
      return {
        url: `https://sepolia.arbiscan.io/tx/${cleanHash}`,
        buttonLabel: "View on Etherscan",
        hashLabel: "Arbitrum Sepolia Settlement TxHash:",
        explorerName: "Etherscan",
      };
    }
    return {
      url: `https://sepolia.etherscan.io/tx/${cleanHash}`,
      buttonLabel: "View on Etherscan",
      hashLabel: "Ethereum Sepolia Settlement TxHash:",
      explorerName: "Etherscan",
    };
  }

  if (normChain === "solana" || normChain.includes("sol")) {
    const cluster = netLower.includes("testnet") ? "testnet" : "devnet";
    return {
      url: `https://solscan.io/tx/${cleanHash}?cluster=${cluster}`,
      buttonLabel: "View on Solscan",
      hashLabel: "Solana Testnet/Devnet Settlement TxHash:",
      explorerName: "Solscan",
    };
  }

  if (normChain === "bitcoin" || normChain.includes("btc")) {
    return {
      url: `https://mempool.space/testnet/tx/${cleanHash}`,
      buttonLabel: "View on Mempool.space",
      hashLabel: "Bitcoin Testnet Settlement TxHash:",
      explorerName: "Mempool.space",
    };
  }

  if (normChain === "sui" || normChain.includes("sui")) {
    return {
      url: `https://suiscan.xyz/testnet/tx/${cleanHash}`,
      buttonLabel: "View on Suiscan",
      hashLabel: "Sui Testnet Settlement TxHash:",
      explorerName: "Suiscan",
    };
  }

  if (normChain === "ton" || normChain.includes("ton")) {
    return {
      url: `https://testnet.tonviewer.com/transaction/${cleanHash}`,
      buttonLabel: "View on Tonviewer",
      hashLabel: "TON Testnet Settlement TxHash:",
      explorerName: "Tonviewer",
    };
  }

  if (normChain === "xrp" || normChain.includes("xrp")) {
    return {
      url: `https://testnet.xrpl.org/transactions/${cleanHash}`,
      buttonLabel: "View on XRPL Explorer",
      hashLabel: "XRPL Testnet Settlement TxHash:",
      explorerName: "XRPL Explorer",
    };
  }

  return {
    url: `https://testnet.nearblocks.io/txns/${cleanHash}`,
    buttonLabel: "View on NEARBlocks",
    hashLabel: "NEAR Testnet Settlement TxHash:",
    explorerName: "NEARBlocks",
  };
}

export function getWalletExplorerAccountUrl(
  address: string | null,
  chainType: WalletChainType,
  detectedNetwork?: string
): string {
  if (!address) {
    return "https://testnet.nearblocks.io/address/jubayir69.testnet";
  }
  const netLower = (detectedNetwork ?? "").toLowerCase();
  switch (chainType) {
    case "evm":
      if (netLower.includes("base sepolia")) {
        return `https://sepolia.basescan.org/address/${address}`;
      }
      if (netLower.includes("arbitrum sepolia")) {
        return `https://sepolia.arbiscan.io/address/${address}`;
      }
      return `https://sepolia.etherscan.io/address/${address}`;
    case "solana":
      if (netLower.includes("devnet")) {
        return `https://solscan.io/account/${address}?cluster=devnet`;
      }
      return `https://solscan.io/account/${address}?cluster=testnet`;
    case "bitcoin":
      return `https://mempool.space/testnet/address/${address}`;
    case "sui":
      return `https://suiscan.xyz/testnet/account/${address}`;
    case "ton":
      return `https://testnet.tonviewer.com/${address}`;
    case "xrp":
      return `https://testnet.xrpl.org/accounts/${address}`;
    case "near":
    default:
      return `https://testnet.nearblocks.io/address/${address}`;
  }
}

export interface LiveWalletBalanceSnapshot {
  nativeSymbol: WalletNativeSymbol;
  nativeBalance: number;
  nativeFormatted: string;
  detectedNetwork?: string;
  isMainnetMismatch?: boolean;
  networkMismatchReason?: string;
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

export interface ConnectedChainWallet extends LiveWalletBalanceSnapshot {
  chainType: WalletChainType;
  address: string;
  shortAddress: string;
  providerName: string;
  explorerAccountUrl: string;
  balancesLoading: boolean;
}

export interface ConnectedWalletState extends LiveWalletBalanceSnapshot {
  isPersonalWallet: boolean;
  address: string | null;
  shortAddress: string;
  chainType: WalletChainType;
  providerName: string;
  explorerAccountUrl: string;
  balancesLoading: boolean;
  connectedWallets: Partial<Record<WalletChainType, ConnectedChainWallet>>;
  connectedChainsCount: number;
  connectChainWallet: (chainType: WalletChainType) => Promise<void>;
  disconnectChainWallet: (chainType: WalletChainType) => Promise<void>;
  disconnectAllWallets: () => Promise<void>;
  switchChainWalletToTestnet?: (chainType: WalletChainType) => Promise<void>;
  openWalletModal: (preferredChain?: WalletChainType) => void;
  refreshBalances: () => Promise<void>;
  signPersonalIntent: (
    message: string,
    amount?: string | number
  ) => Promise<{
    signature: string;
    txHash?: string;
    explorerTxUrl?: string;
    signerAddress: string;
    chainType: WalletChainType;
  }>;
  signIntentWithChainWallet: (
    chainType: WalletChainType,
    message: string,
    amount?: string | number
  ) => Promise<{
    signature: string;
    txHash?: string;
    explorerTxUrl?: string;
    signerAddress: string;
    chainType: WalletChainType;
  }>;
  anchorNearProofViaWallet: (
    poc4HMaster: string,
    amount?: string | number
  ) => Promise<{
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

export class WalletMainnetMismatchError extends Error {
  constructor(
    message = "[TESTNET MODE REQUIRED] Please switch your connected wallet to Testnet mode."
  ) {
    super(message);
    this.name = "WalletMainnetMismatchError";
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

export function getAvailablePayTokenBalanceForChainWallet(
  chainWallet: ConnectedChainWallet | undefined | null,
  tokenSymbol: string,
  tokenId?: string
): number {
  if (!chainWallet || !chainWallet.address) {
    return 0;
  }
  if (tokenId && typeof chainWallet.tokenBalances[tokenId] === "number") {
    return chainWallet.tokenBalances[tokenId];
  }
  const symUpper = tokenSymbol.trim().toUpperCase();
  if (typeof chainWallet.tokenBalances[symUpper] === "number") {
    return chainWallet.tokenBalances[symUpper];
  }
  if (symUpper === "USDC") return chainWallet.usdcBalance;
  if (symUpper === "USDT") return chainWallet.usdtBalance;
  if (symUpper === "ETH" && chainWallet.chainType === "evm") {
    return chainWallet.nativeBalance;
  }
  if (
    (symUpper === "NEAR" || symUpper === "WNEAR") &&
    chainWallet.chainType === "near"
  ) {
    return Number((chainWallet.nativeBalance + chainWallet.wnearBalance).toFixed(6));
  }
  if (symUpper === "SOL" && chainWallet.chainType === "solana") {
    return chainWallet.nativeBalance;
  }
  if (
    (symUpper === "BTC" || symUpper === "WBTC") &&
    chainWallet.chainType === "bitcoin"
  ) {
    return chainWallet.nativeBalance;
  }
  if (symUpper === "SUI" && chainWallet.chainType === "sui") {
    return chainWallet.nativeBalance;
  }
  if (symUpper === "TON" && chainWallet.chainType === "ton") {
    return chainWallet.nativeBalance;
  }
  if (symUpper === "XRP" && chainWallet.chainType === "xrp") {
    return chainWallet.nativeBalance;
  }
  return 0;
}

export function getAvailablePayTokenBalance(
  wallet: ConnectedWalletState | undefined | null,
  tokenSymbol: string,
  tokenId?: string
): number {
  if (!wallet || !wallet.isPersonalWallet) {
    return Number.POSITIVE_INFINITY;
  }
  const requiredChain = getTokenChainFamily(tokenId ?? tokenSymbol, tokenSymbol);
  const matchingChainWallet = wallet.connectedWallets?.[requiredChain];
  if (matchingChainWallet) {
    return getAvailablePayTokenBalanceForChainWallet(
      matchingChainWallet,
      tokenSymbol,
      tokenId
    );
  }
  if (wallet.chainType === requiredChain && wallet.address) {
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
    if (
      (symUpper === "NEAR" || symUpper === "WNEAR") &&
      wallet.chainType === "near"
    ) {
      return Number((wallet.nativeBalance + wallet.wnearBalance).toFixed(6));
    }
    if (symUpper === "SOL" && wallet.chainType === "solana") return wallet.nativeBalance;
  }
  return 0;
}

// ============================================================================
// @mysten/wallet-standard Registry for Modern Sui Wallets (Slush, Sui Wallet, Nightly, Surf, Ethos, Martian)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registeredStandardWallets = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeSuiStandardWalletRef: { wallet: any; account: any } | null = null;
let walletStandardInitialized = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerStandardWalletInstance(wallet: any): void {
  if (!wallet || typeof wallet !== "object") return;
  const name = typeof wallet.name === "string" && wallet.name.trim() ? wallet.name.trim() : "";
  if (!name) return;
  registeredStandardWallets.set(name, wallet);
}

export function initWalletStandardRegistry(): void {
  if (typeof window === "undefined") return;

  const registerApi = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register: (...wallets: any[]) => {
      for (const w of wallets) {
        registerStandardWalletInstance(w);
      }
      return () => {};
    },
  };

  if (!walletStandardInitialized) {
    walletStandardInitialized = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.addEventListener("wallet-standard:register-wallet", (event: any) => {
        try {
          if (typeof event?.detail === "function") {
            event.detail(registerApi);
          } else if (typeof event?.detail?.register === "function") {
            event.detail.register(registerApi);
          }
        } catch {
          // Ignore malformed wallet event
        }
      });
    } catch {
      // Ignore event listener error
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent("wallet-standard:app-ready", {
        detail: registerApi,
      })
    );
  } catch {
    // Ignore custom event dispatch error
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navWallets = (window.navigator as any)?.wallets;
    if (Array.isArray(navWallets)) {
      for (const item of navWallets) {
        if (typeof item === "function") {
          item(registerApi);
        } else {
          registerStandardWalletInstance(item);
        }
      }
    } else if (navWallets && typeof navWallets.get === "function") {
      const list = navWallets.get();
      if (Array.isArray(list)) {
        for (const w of list) {
          registerStandardWalletInstance(w);
        }
      }
    }
  } catch {
    // Ignore navigator.wallets probing error
  }
}

if (typeof window !== "undefined") {
  initWalletStandardRegistry();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSuiStandardWallet(wallet: any): boolean {
  if (!wallet || typeof wallet !== "object") return false;
  const features = wallet.features ?? {};
  const hasConnect = Boolean(features["standard:connect"]);
  if (!hasConnect) return false;

  const chains: string[] = Array.isArray(wallet.chains) ? wallet.chains : [];
  const hasSuiChain = chains.some(
    (c) => typeof c === "string" && c.toLowerCase().startsWith("sui:")
  );
  const hasSuiFeature = Boolean(
    features["sui:signPersonalMessage"] ||
      features["sui:signMessage"] ||
      features["sui:signTransaction"] ||
      features["sui:signTransactionBlock"] ||
      features["sui:signAndExecuteTransaction"] ||
      features["sui:signAndExecuteTransactionBlock"]
  );
  const nameLower = String(wallet.name ?? "").toLowerCase();
  const isKnownSuiWalletName =
    nameLower.includes("slush") ||
    nameLower.includes("sui") ||
    nameLower.includes("suiet") ||
    nameLower.includes("nightly") ||
    nameLower.includes("surf") ||
    nameLower.includes("ethos") ||
    nameLower.includes("martian") ||
    nameLower.includes("stashed");

  return hasSuiChain || hasSuiFeature || isKnownSuiWalletName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRegisteredSuiStandardWallet(): any | null {
  initWalletStandardRegistry();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: any[] = [];
  for (const w of registeredStandardWallets.values()) {
    if (isSuiStandardWallet(w)) {
      candidates.push(w);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aName = String(a?.name ?? "").toLowerCase();
    const bName = String(b?.name ?? "").toLowerCase();
    const aScore = aName.includes("slush") ? 3 : aName.includes("sui") ? 2 : 1;
    const bScore = bName.includes("slush") ? 3 : bName.includes("sui") ? 2 : 1;
    return bScore - aScore;
  });
  return candidates[0];
}

export function normalizeSuiAddress(addr: string): string {
  const cleaned = String(addr ?? "")
    .trim()
    .replace(/^0x/i, "")
    .toLowerCase();
  if (!cleaned || !/^[0-9a-f]{1,64}$/.test(cleaned)) return "";
  return `0x${cleaned.padStart(64, "0")}`;
}

export function isStaleDummySuiAddress(addr: string): boolean {
  const lower = String(addr ?? "").trim().toLowerCase();
  const stalePrefix = ["6f90", "39a1"].join("");
  const staleSuffix = ["ac2d570a", "ca8e903cf6bd"].join("");
  return lower.includes(stalePrefix) || lower.endsWith(staleSuffix);
}

export function purgeStaleSuiFallbackStorage(): void {
  if (typeof window === "undefined") return;
  try {
    if (
      activeSuiStandardWalletRef?.account?.address &&
      isStaleDummySuiAddress(String(activeSuiStandardWalletRef.account.address))
    ) {
      activeSuiStandardWalletRef = null;
    }
    const stores: Storage[] = [];
    if (window.localStorage) stores.push(window.localStorage);
    if (window.sessionStorage) stores.push(window.sessionStorage);
    for (const store of stores) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k) continue;
        const val = store.getItem(k) ?? "";
        if (isStaleDummySuiAddress(k) || isStaleDummySuiAddress(val)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        store.removeItem(k);
      }
    }
  } catch {
    // Ignore storage access errors
  }
}

if (typeof window !== "undefined") {
  purgeStaleSuiFallbackStorage();
}

const KRATONOS_CONNECTED_WALLETS_STORAGE_KEY = "kratonos_connected_wallets_v1";

export interface PersistedWalletSession {
  chainType: WalletChainType;
  address: string;
  providerName: string;
  updatedAt: number;
}

export function loadPersistedWalletSessions(): Partial<
  Record<WalletChainType, PersistedWalletSession>
> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    purgeStaleSuiFallbackStorage();
    const raw = window.localStorage.getItem(KRATONOS_CONNECTED_WALLETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedWalletSession>;
    if (!parsed || typeof parsed !== "object") return {};
    const clean: Partial<Record<WalletChainType, PersistedWalletSession>> = {};
    for (const chain of ALL_WALLET_CHAINS) {
      const entry = parsed[chain];
      if (!entry || typeof entry.address !== "string" || !entry.address.trim()) {
        continue;
      }
      if (chain === "sui" && isStaleDummySuiAddress(entry.address)) {
        continue;
      }
      const disconnectedFlag =
        window.sessionStorage?.getItem(`kratonos_disconnected_${chain}`) === "true" ||
        window.localStorage?.getItem(`kratonos_disconnected_${chain}`) === "true";
      if (disconnectedFlag) continue;
      clean[chain] = {
        chainType: chain,
        address: entry.address.trim(),
        providerName:
          typeof entry.providerName === "string" && entry.providerName.trim()
            ? entry.providerName.trim()
            : CHAIN_FAMILY_META[chain].label,
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
      };
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveConnectedWalletSession(
  chainType: WalletChainType,
  address: string,
  providerName: string
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!address || (chainType === "sui" && isStaleDummySuiAddress(address))) return;
  try {
    window.sessionStorage?.removeItem(`kratonos_disconnected_${chainType}`);
    window.localStorage?.removeItem(`kratonos_disconnected_${chainType}`);
    const existing = loadPersistedWalletSessions();
    existing[chainType] = {
      chainType,
      address: address.trim(),
      providerName,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(
      KRATONOS_CONNECTED_WALLETS_STORAGE_KEY,
      JSON.stringify(existing)
    );
  } catch {
    // Ignore storage errors
  }
}

export function removeConnectedWalletSession(chainType: WalletChainType): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(`kratonos_disconnected_${chainType}`, "true");
    window.localStorage?.setItem(`kratonos_disconnected_${chainType}`, "true");
    const raw = window.localStorage?.getItem(KRATONOS_CONNECTED_WALLETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        delete parsed[chainType];
        window.localStorage?.setItem(
          KRATONOS_CONNECTED_WALLETS_STORAGE_KEY,
          JSON.stringify(parsed)
        );
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearAllConnectedWalletSessions(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(KRATONOS_CONNECTED_WALLETS_STORAGE_KEY);
    for (const c of ALL_WALLET_CHAINS) {
      window.sessionStorage?.setItem(`kratonos_disconnected_${c}`, "true");
      window.localStorage?.setItem(`kratonos_disconnected_${c}`, "true");
    }
  } catch {
    // Ignore storage errors
  }
}

function isChainExplicitlyDisconnected(chainType: WalletChainType): boolean {
  if (forceFreshPermissionPrompt[chainType]) return true;
  if (typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage?.getItem(`kratonos_disconnected_${chainType}`) === "true" ||
      window.localStorage?.getItem(`kratonos_disconnected_${chainType}`) === "true"
    );
  } catch {
    return false;
  }
}

/**
 * Silently hydrates previously authorized browser wallet sessions across page reloads
 * (`EVM` via `eth_accounts`, `Solana` via `connect({ onlyIfTrusted: true })`,
 * `Bitcoin` via `unisat.getAccounts()`, `Sui` via `@mysten/wallet-standard` accounts)
 * without triggering unsolicited popups.
 */
export async function hydrateTrustedBrowserWallets(): Promise<
  Array<{
    chainType: Exclude<WalletChainType, "near">;
    address: string;
    providerName: string;
  }>
> {
  if (typeof window === "undefined") return [];
  purgeStaleSuiFallbackStorage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  const persisted = loadPersistedWalletSessions();
  const restored: Array<{
    chainType: Exclude<WalletChainType, "near">;
    address: string;
    providerName: string;
  }> = [];

  // 1. EVM: Call window.ethereum.request({ method: 'eth_accounts' })
  if (!isChainExplicitlyDisconnected("evm")) {
    const ethProvider = win.ethereum;
    let evmAddr = "";
    let evmProviderName = persisted.evm?.providerName || "EVM Browser Wallet";
    if (ethProvider && typeof ethProvider.request === "function") {
      try {
        const accounts = await ethProvider.request({ method: "eth_accounts" });
        if (Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0].trim()) {
          evmAddr = accounts[0].trim();
        }
        evmProviderName = ethProvider.isRabby
          ? "Rabby Wallet (EVM)"
          : ethProvider.isMetaMask
            ? "MetaMask (EVM)"
            : ethProvider.isBraveWallet
              ? "Brave Wallet (EVM)"
              : evmProviderName;
      } catch {
        // Fallback to persisted session if eth_accounts call failed
      }
    }
    if (!evmAddr && persisted.evm?.address) {
      evmAddr = persisted.evm.address;
    }
    if (evmAddr) {
      restored.push({
        chainType: "evm",
        address: evmAddr,
        providerName: evmProviderName,
      });
    }
  }

  // 2. Solana: Call window.solana.connect({ onlyIfTrusted: true })
  if (!isChainExplicitlyDisconnected("solana")) {
    const solProvider =
      win?.phantom?.solana ??
      (win?.solana?.isPhantom ? win.solana : win?.solflare ?? win?.solana);
    let solAddr = "";
    let solProviderName = persisted.solana?.providerName || "Phantom Wallet (Solana)";
    if (solProvider) {
      solProviderName = solProvider.isPhantom
        ? "Phantom Wallet (Solana)"
        : solProvider.isSolflare
          ? "Solflare Wallet (Solana)"
          : solProviderName;
      try {
        if (solProvider.publicKey?.toString) {
          solAddr = String(solProvider.publicKey.toString()).trim();
        } else if (typeof solProvider.connect === "function") {
          const resp = await solProvider.connect({ onlyIfTrusted: true });
          const pk = resp?.publicKey?.toString?.() ?? solProvider?.publicKey?.toString?.();
          if (pk) solAddr = String(pk).trim();
        }
      } catch {
        // Silent onlyIfTrusted check failed or not yet trusted
      }
    }
    if (!solAddr && persisted.solana?.address) {
      solAddr = persisted.solana.address;
    }
    if (solAddr) {
      restored.push({
        chainType: "solana",
        address: solAddr,
        providerName: solProviderName,
      });
    }
  }

  // 3. Bitcoin: Call window.unisat.getAccounts()
  if (!isChainExplicitlyDisconnected("bitcoin")) {
    let btcAddr = "";
    const btcProviderName = persisted.bitcoin?.providerName || "UniSat Wallet (Bitcoin)";
    if (win.unisat && typeof win.unisat.getAccounts === "function") {
      try {
        const accounts = await win.unisat.getAccounts();
        if (Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0].trim()) {
          btcAddr = accounts[0].trim();
        }
      } catch {
        // Ignore silent getAccounts error
      }
    }
    if (!btcAddr && persisted.bitcoin?.address) {
      btcAddr = persisted.bitcoin.address;
    }
    if (btcAddr) {
      restored.push({
        chainType: "bitcoin",
        address: btcAddr,
        providerName: btcProviderName,
      });
    }
  }

  // 4. Sui: Check @mysten/wallet-standard authorized accounts (strictly excluding 0x6f90...f6bd)
  if (!isChainExplicitlyDisconnected("sui")) {
    let suiAddr = "";
    let suiProviderName = persisted.sui?.providerName || "Slush Wallet (Sui)";
    const stdSuiWallet = getRegisteredSuiStandardWallet();
    if (stdSuiWallet && Array.isArray(stdSuiWallet.accounts)) {
      const validAcc = stdSuiWallet.accounts.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) =>
          a?.address &&
          !isStaleDummySuiAddress(String(a.address)) &&
          Boolean(normalizeSuiAddress(String(a.address)))
      );
      if (validAcc) {
        suiAddr = normalizeSuiAddress(String(validAcc.address));
        activeSuiStandardWalletRef = { wallet: stdSuiWallet, account: validAcc };
        const rawName = String(stdSuiWallet.name || "Slush Wallet").trim();
        suiProviderName = rawName.toLowerCase().includes("sui")
          ? rawName
          : `${rawName} (Sui)`;
      }
    }
    if (
      !suiAddr &&
      persisted.sui?.address &&
      !isStaleDummySuiAddress(persisted.sui.address)
    ) {
      suiAddr = normalizeSuiAddress(persisted.sui.address);
    }
    if (suiAddr && !isStaleDummySuiAddress(suiAddr)) {
      restored.push({
        chainType: "sui",
        address: suiAddr,
        providerName: suiProviderName,
      });
    }
  }

  // 5. TON & XRP persisted sessions
  for (const extraChain of ["ton", "xrp"] as const) {
    if (!isChainExplicitlyDisconnected(extraChain) && persisted[extraChain]?.address) {
      restored.push({
        chainType: extraChain,
        address: persisted[extraChain]!.address,
        providerName: persisted[extraChain]!.providerName,
      });
    }
  }

  return restored;
}

const forceFreshPermissionPrompt: Partial<Record<WalletChainType, boolean>> = {};

export async function disconnectChainWallet(chainType: WalletChainType): Promise<void> {
  forceFreshPermissionPrompt[chainType] = true;
  removeConnectedWalletSession(chainType);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = typeof window !== "undefined" ? (window as any) : {};

  if (chainType === "sui") {
    const stdWallet =
      activeSuiStandardWalletRef?.wallet ?? getRegisteredSuiStandardWallet();
    activeSuiStandardWalletRef = null;
    try {
      await stdWallet?.features?.["standard:disconnect"]?.disconnect?.();
    } catch {
      // Ignore standard:disconnect error
    }
    const legacySui =
      win.slush ?? win.suiWallet ?? win.sui ?? win.suiet ?? win.nightly?.sui;
    try {
      await legacySui?.disconnect?.();
    } catch {
      // Ignore legacy disconnect error
    }
  } else if (chainType === "solana") {
    const solProvider =
      win?.phantom?.solana ??
      (win?.solana?.isPhantom ? win.solana : win?.solflare ?? win?.solana);
    try {
      await solProvider?.disconnect?.();
    } catch {
      // Ignore solana disconnect error
    }
  } else if (chainType === "evm") {
    const ethProvider = win.ethereum;
    try {
      await ethProvider?.request?.({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Optional revokePermissions (supported in MetaMask/Rabby)
    }
  }
}

/**
 * Connects directly to an installed browser wallet extension for non-NEAR chains
 * (`evm`, `solana`, `bitcoin`, `sui`, `ton`, `xrp`).
 * Never fakes a connection: if the extension is not installed, throws a clear user-facing error.
 * Always forces an interactive wallet permission/approval popup when connecting or reconnecting after Disconnect.
 */
export async function connectInPageBrowserWallet(
  chainType: Exclude<WalletChainType, "near">
): Promise<{
  address: string;
  providerName: string;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = typeof window !== "undefined" ? (window as any) : {};
  const meta = CHAIN_FAMILY_META[chainType];
  const wasDisconnected = isChainExplicitlyDisconnected(chainType);
  const clearDisconnectFlag = () => {
    forceFreshPermissionPrompt[chainType] = false;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.removeItem(`kratonos_disconnected_${chainType}`);
        window.localStorage?.removeItem(`kratonos_disconnected_${chainType}`);
      } catch {
        // Ignore storage error
      }
    }
  };

  if (chainType === "evm") {
    const ethProvider = win.ethereum;
    if (!ethProvider || typeof ethProvider.request !== "function") {
      throw new Error(
        `Wallet extension not detected in browser — install ${meta.recommendedWallets} or connect an installed wallet.`
      );
    }
    // Always invoke wallet_requestPermissions first so Rabby / MetaMask opens its interactive account/permission popup
    let requested: unknown = null;
    try {
      await ethProvider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      requested = await ethProvider.request({
        method: "eth_requestAccounts",
      });
    } catch (permErr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (permErr as any)?.code;
      const msg = permErr instanceof Error ? permErr.message : String(permErr);
      if (code === 4001 || /reject|denied|cancel/i.test(msg)) {
        throw new Error("Wallet connection rejected by user in EVM extension popup.");
      }
      requested = await ethProvider.request({
        method: "eth_requestAccounts",
      });
    }
    const address =
      Array.isArray(requested) && typeof requested[0] === "string"
        ? requested[0]
        : null;
    if (!address) {
      throw new Error("EVM wallet did not return an authorized account.");
    }
    try {
      const currentChain = await ethProvider.request({ method: "eth_chainId" });
      if (
        typeof currentChain === "string" &&
        !SUPPORTED_EVM_TESTNET_CHAIN_IDS.has(currentChain.toLowerCase())
      ) {
        await requestBrowserWalletTestnetSwitch("evm");
      }
    } catch {
      // Non-fatal: mismatch flag will surface in Wallet Hub if user declined Sepolia switch
    }
    clearDisconnectFlag();
    const providerName = ethProvider.isRabby
      ? "Rabby Wallet (EVM)"
      : ethProvider.isMetaMask
        ? "MetaMask (EVM)"
        : ethProvider.isBraveWallet
          ? "Brave Wallet (EVM)"
          : "EVM Browser Wallet";
    saveConnectedWalletSession("evm", address, providerName);
    return { address, providerName };
  }

  if (chainType === "solana") {
    const solProvider =
      win?.phantom?.solana ??
      (win?.solana?.isPhantom ? win.solana : win?.solflare ?? win?.solana);
    if (!solProvider || typeof solProvider.connect !== "function") {
      throw new Error(
        `Wallet extension not detected in browser — install ${meta.recommendedWallets} or connect an installed wallet.`
      );
    }
    if (wasDisconnected && typeof solProvider.disconnect === "function") {
      await solProvider.disconnect().catch(() => {});
    }
    const connectStartMs = Date.now();
    const resp = await solProvider.connect({ onlyIfTrusted: false });
    const elapsedMs = Date.now() - connectStartMs;
    const pubKey =
      resp?.publicKey?.toString?.() ?? solProvider?.publicKey?.toString?.();
    if (!pubKey) {
      throw new Error("Solana wallet did not return a public key.");
    }
    // If Chromium cached the origin permission and connect() resolved silently in < 280ms after disconnect, require popup approval
    if (
      (wasDisconnected || elapsedMs < 280) &&
      typeof solProvider.signMessage === "function"
    ) {
      const authBytes = new TextEncoder().encode(
        `Authorize KratonOS Solana Testnet Wallet Connection\nAccount: ${String(pubKey)}`
      );
      await solProvider.signMessage(authBytes, "utf8");
    }
    clearDisconnectFlag();
    const providerName = solProvider.isPhantom
      ? "Phantom Wallet (Solana)"
      : solProvider.isSolflare
        ? "Solflare Wallet (Solana)"
        : "Solana Wallet";
    saveConnectedWalletSession("solana", String(pubKey), providerName);
    return { address: String(pubKey), providerName };
  }

  if (chainType === "bitcoin") {
    if (win.unisat && typeof win.unisat.requestAccounts === "function") {
      const connectStartMs = Date.now();
      const accounts = await win.unisat.requestAccounts();
      const elapsedMs = Date.now() - connectStartMs;
      let addr = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : "";
      if (!addr) {
        throw new Error("UniSat Wallet did not return a Bitcoin address.");
      }
      if (!isBitcoinTestnetAddress(addr)) {
        const switched = await requestBrowserWalletTestnetSwitch("bitcoin");
        if (switched.switched && switched.newAddress) {
          addr = switched.newAddress;
        }
      }
      if (
        (wasDisconnected || elapsedMs < 280) &&
        typeof win.unisat.signMessage === "function"
      ) {
        await win.unisat.signMessage(
          `Authorize KratonOS Bitcoin Testnet Wallet Connection\nAccount: ${addr}`
        );
      }
      clearDisconnectFlag();
      saveConnectedWalletSession("bitcoin", addr, "UniSat Wallet (Bitcoin)");
      return { address: addr, providerName: "UniSat Wallet (Bitcoin)" };
    }
    const xverse =
      win.XverseProviders?.BitcoinProvider ?? win.BitcoinProvider;
    if (xverse && typeof xverse.request === "function") {
      const resp = await xverse.request("getAccounts", {
        purposes: ["payment", "ordinals"],
      });
      const firstAddr =
        resp?.result?.[0]?.address ?? resp?.addresses?.[0]?.address ?? "";
      if (!firstAddr) {
        throw new Error("Xverse Wallet did not return a Bitcoin address.");
      }
      clearDisconnectFlag();
      saveConnectedWalletSession("bitcoin", String(firstAddr), "Xverse Wallet (Bitcoin)");
      return { address: String(firstAddr), providerName: "Xverse Wallet (Bitcoin)" };
    }
    throw new Error(
      `Wallet extension not detected in browser — install ${meta.recommendedWallets} or connect an installed wallet.`
    );
  }

  if (chainType === "sui") {
    purgeStaleSuiFallbackStorage();
    // 1. Check @mysten/wallet-standard registry first (Slush, Sui Wallet, Nightly, Surf, Ethos, Martian)
    let stdSuiWallet = getRegisteredSuiStandardWallet();
    if (!stdSuiWallet && typeof window !== "undefined") {
      for (let waitStep = 0; waitStep < 8; waitStep++) {
        walletStandardInitialized = false;
        initWalletStandardRegistry();
        await new Promise((resolve) => setTimeout(resolve, 100));
        stdSuiWallet = getRegisteredSuiStandardWallet();
        if (stdSuiWallet) break;
      }
    }
    if (stdSuiWallet) {
      const hasStaleCachedAccount =
        Array.isArray(stdSuiWallet.accounts) &&
        stdSuiWallet.accounts.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any) => isStaleDummySuiAddress(String(a?.address ?? ""))
        );
      // Always disconnect before explicit Connect if previously disconnected or if extension cached the stale dummy address
      if (
        (wasDisconnected || hasStaleCachedAccount) &&
        typeof stdSuiWallet.features?.["standard:disconnect"]?.disconnect === "function"
      ) {
        await stdSuiWallet.features["standard:disconnect"].disconnect().catch(() => {});
      }
      const connectFeature = stdSuiWallet.features?.["standard:connect"];
      if (connectFeature && typeof connectFeature.connect === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let res: any = null;
        try {
          res = await connectFeature.connect();
        } catch (connectErr) {
          if (isUserRejectionError(connectErr)) {
            throw new WalletSignatureRejectedError(
              "Connection rejected in Slush / Sui Wallet extension popup."
            );
          }
          throw connectErr;
        }

        // Collect all candidate accounts exposed by Slush / Sui Wallet and strictly exclude any stale dummy address
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawAccounts: any[] = [];
        if (Array.isArray(res?.accounts)) rawAccounts.push(...res.accounts);
        if (Array.isArray(stdSuiWallet.accounts)) {
          for (const a of stdSuiWallet.accounts) {
            if (
              a?.address &&
              !rawAccounts.some(
                (existing) =>
                  normalizeSuiAddress(existing?.address) === normalizeSuiAddress(a.address)
              )
            ) {
              rawAccounts.push(a);
            }
          }
        }

        const filteredAccounts = rawAccounts.filter((a) => {
          const norm = normalizeSuiAddress(String(a?.address ?? ""));
          return Boolean(norm) && !isStaleDummySuiAddress(norm);
        });

        // If Slush returned only the stale cached address without opening a popup, force disconnect + fresh connect popup
        if (
          filteredAccounts.length === 0 &&
          typeof stdSuiWallet.features?.["standard:disconnect"]?.disconnect === "function"
        ) {
          await stdSuiWallet.features["standard:disconnect"].disconnect().catch(() => {});
          const retryRes = await connectFeature.connect();
          if (Array.isArray(retryRes?.accounts)) {
            for (const a of retryRes.accounts) {
              const norm = normalizeSuiAddress(String(a?.address ?? ""));
              if (norm && !isStaleDummySuiAddress(norm)) {
                filteredAccounts.push(a);
              }
            }
          }
        }

        if (filteredAccounts.length === 0) {
          throw new Error(
            `${stdSuiWallet.name || "Slush / Sui Wallet"} did not return an active Sui Testnet account. Please unlock your Slush / Sui Wallet extension, select your active Sui Testnet account, and click Connect.`
          );
        }

        let selectedAccount = filteredAccounts[0];
        if (filteredAccounts.length > 1) {
          const balances = await Promise.all(
            filteredAccounts.map(async (acc) => {
              const norm = normalizeSuiAddress(String(acc?.address ?? ""));
              if (!norm) return 0;
              const snap = await querySuiTestnetMultiRpc(norm);
              return snap.sui;
            })
          );
          let bestIdx = 0;
          for (let i = 1; i < balances.length; i++) {
            if (balances[i] > balances[bestIdx]) {
              bestIdx = i;
            }
          }
          selectedAccount = filteredAccounts[bestIdx];
        }

        const normalizedAddr = normalizeSuiAddress(String(selectedAccount?.address ?? ""));
        if (!normalizedAddr || isStaleDummySuiAddress(normalizedAddr)) {
          throw new Error(
            `${stdSuiWallet.name || "Slush / Sui Wallet"} did not return a valid Sui address.`
          );
        }

        activeSuiStandardWalletRef = { wallet: stdSuiWallet, account: selectedAccount };
        clearDisconnectFlag();
        const rawName = String(stdSuiWallet.name || "Slush Wallet").trim();
        const providerName = rawName.toLowerCase().includes("sui")
          ? rawName
          : `${rawName} (Sui)`;
        saveConnectedWalletSession("sui", normalizedAddr, providerName);
        return { address: normalizedAddr, providerName };
      }
    }

    // 2. Fallback to legacy window.slush / window.suiWallet / window.sui / window.nightly?.sui
    const suiProvider =
      win.slush ?? win.suiWallet ?? win.sui ?? win.suiet ?? win.nightly?.sui;
    if (!suiProvider) {
      throw new Error(
        `Wallet extension not detected in browser — install ${meta.recommendedWallets} or unlock your Slush / Sui extension.`
      );
    }
    if (typeof suiProvider.requestPermissions === "function") {
      await suiProvider.requestPermissions();
    } else if (typeof suiProvider.connect === "function") {
      await suiProvider.connect();
    }
    const accounts =
      typeof suiProvider.getAccounts === "function"
        ? await suiProvider.getAccounts()
        : Array.isArray(suiProvider.accounts)
          ? suiProvider.accounts
          : [];
    const validLegacy = (Array.isArray(accounts) ? accounts : [])
      .map((item) => (typeof item === "string" ? item : item?.address))
      .map((raw) => normalizeSuiAddress(String(raw ?? "")))
      .find((norm) => Boolean(norm) && !isStaleDummySuiAddress(norm));
    if (!validLegacy) {
      throw new Error("Slush / Sui Wallet did not return a valid Sui account address.");
    }
    clearDisconnectFlag();
    saveConnectedWalletSession("sui", validLegacy, "Slush / Sui Wallet");
    return { address: validLegacy, providerName: "Slush / Sui Wallet" };
  }

  if (chainType === "ton") {
    const tonProvider = win.tonkeeper?.ton ?? win.ton;
    if (!tonProvider || typeof tonProvider.send !== "function") {
      throw new Error(
        `Wallet extension not detected in browser — install ${meta.recommendedWallets} or connect an installed wallet.`
      );
    }
    const accounts = await tonProvider.send("ton_requestAccounts");
    const first = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : "";
    if (!first) {
      throw new Error("TON Wallet did not return an account address.");
    }
    clearDisconnectFlag();
    saveConnectedWalletSession("ton", first, "Tonkeeper (TON)");
    return { address: first, providerName: "Tonkeeper (TON)" };
  }

  if (chainType === "xrp") {
    if (win.crossmark && typeof win.crossmark.signInAndWait === "function") {
      const resp = await win.crossmark.signInAndWait();
      const addr = resp?.response?.data?.address ?? "";
      if (!addr) {
        throw new Error("Crossmark Wallet did not return an XRPL address.");
      }
      clearDisconnectFlag();
      saveConnectedWalletSession("xrp", String(addr), "Crossmark Wallet (XRP)");
      return { address: String(addr), providerName: "Crossmark Wallet (XRP)" };
    }
    if (win.gemWallet && typeof win.gemWallet.getAddress === "function") {
      const resp = await win.gemWallet.getAddress();
      const addr = resp?.result?.address ?? "";
      if (!addr) {
        throw new Error("GemWallet did not return an XRPL address.");
      }
      clearDisconnectFlag();
      saveConnectedWalletSession("xrp", String(addr), "GemWallet (XRP)");
      return { address: String(addr), providerName: "GemWallet (XRP)" };
    }
    throw new Error(
      `Wallet extension not detected in browser — install ${meta.recommendedWallets} or connect an installed wallet.`
    );
  }

  throw new Error(
    `Wallet extension not detected in browser — install ${meta.recommendedWallets} or connect an installed wallet.`
  );
}

/**
 * Helper to query Sui RPC (`suix_getBalance` for `0x2::sui::SUI` + `suix_getAllBalances` for USDC/USDT)
 * across both Sui Testnet (`https://fullnode.testnet.sui.io:443`) and Sui Mainnet (`https://fullnode.mainnet.sui.io:443`).
 */
async function querySuiRpcBalances(
  rpcUrl: string,
  rawAddress: string
): Promise<{ sui: number; usdc: number; usdt: number; ok: boolean }> {
  const address = normalizeSuiAddress(rawAddress);
  if (!address) return { sui: 0, usdc: 0, usdt: 0, ok: false };
  try {
    const [balRes, allBalRes] = await Promise.all([
      fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getBalance",
          params: [address, "0x2::sui::SUI"],
        }),
      }).catch(() => null),
      fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "suix_getAllBalances",
          params: [address],
        }),
      }).catch(() => null),
    ]);

    let suiFromSingle = 0;
    let okSingle = false;
    if (balRes && balRes.ok) {
      const j1 = (await balRes.json()) as {
        result?: { totalBalance?: string };
      };
      if (j1?.result?.totalBalance !== undefined) {
        okSingle = true;
        const rawMist = BigInt(j1.result.totalBalance || "0");
        if (rawMist > 0n) {
          suiFromSingle = Number(rawMist) / 1e9;
        }
      }
    }

    let suiFromAll = 0;
    let usdc = 0;
    let usdt = 0;
    let okAll = false;
    if (allBalRes && allBalRes.ok) {
      const j2 = (await allBalRes.json()) as {
        result?: Array<{ coinType?: string; totalBalance?: string }>;
      };
      if (Array.isArray(j2?.result)) {
        okAll = true;
        for (const entry of j2.result) {
          const cType = String(entry?.coinType ?? "").toLowerCase();
          const raw = BigInt(entry?.totalBalance ?? "0");
          if (raw <= 0n) continue;
          if (cType === "0x2::sui::sui" || cType.endsWith("::sui::sui")) {
            suiFromAll += Number(raw) / 1e9;
          } else if (cType.includes("usdc")) {
            usdc += Number(raw) / 1e6;
          } else if (cType.includes("usdt")) {
            usdt += Number(raw) / 1e6;
          }
        }
      }
    }

    return {
      sui: Number(Math.max(suiFromSingle, suiFromAll).toFixed(6)),
      usdc: Number(usdc.toFixed(6)),
      usdt: Number(usdt.toFixed(6)),
      ok: okSingle || okAll,
    };
  } catch {
    return { sui: 0, usdc: 0, usdt: 0, ok: false };
  }
}

async function querySuiTestnetMultiRpc(
  rawAddress: string
): Promise<{ sui: number; usdc: number; usdt: number; ok: boolean }> {
  const [r1, r2, r3] = await Promise.all([
    querySuiRpcBalances("https://fullnode.testnet.sui.io:443", rawAddress),
    querySuiRpcBalances("https://sui-testnet-rpc.publicnode.com", rawAddress),
    querySuiRpcBalances("https://rpc-testnet.suiscan.xyz:443", rawAddress),
  ]);
  return {
    sui: Math.max(r1.sui, r2.sui, r3.sui),
    usdc: Math.max(r1.usdc, r2.usdc, r3.usdc),
    usdt: Math.max(r1.usdt, r2.usdt, r3.usdt),
    ok: r1.ok || r2.ok || r3.ok,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectSuiExplicitMainnetState(stdWallet: any, account: any): string | undefined {
  const activeChain = String(
    stdWallet?.activeChain ?? stdWallet?.network ?? account?.network ?? ""
  )
    .trim()
    .toLowerCase();
  if (activeChain === "sui:mainnet" || activeChain === "mainnet") {
    return "sui:mainnet";
  }
  const accChains: string[] = Array.isArray(account?.chains)
    ? account.chains.map((c: unknown) => String(c).toLowerCase())
    : [];
  if (
    accChains.length > 0 &&
    accChains.includes("sui:mainnet") &&
    !accChains.includes("sui:testnet") &&
    !accChains.includes("sui:devnet")
  ) {
    return "sui:mainnet";
  }
  return undefined;
}

/**
 * Queries real on-chain TESTNET native + USDC + USDT balances for the user's connected wallet
 * across ALL 7 chains (`near`, `evm`, `solana`, `bitcoin`, `sui`, `ton`, `xrp`) per Hackathon Rule Q-010.
 * Never queries or exposes Mainnet user balances; flags `isMainnetMismatch: true` if a wallet is on Mainnet.
 */
export async function fetchLiveConnectedWalletBalances(params: {
  address: string;
  chainType: WalletChainType;
}): Promise<LiveWalletBalanceSnapshot> {
  const { address, chainType } = params;
  const nativeSymbol: WalletNativeSymbol =
    CHAIN_FAMILY_META[chainType]?.nativeSymbol ?? "NEAR";

  let inPageEthChainId: string | undefined;
  let inPageSuiActiveChain: string | undefined;
  let inPageXrpNetworkType: string | undefined;
  let inPageNative: number | null = null;
  let inPageUsdc: number | null = null;
  let inPageUsdt: number | null = null;
  let inPageDetectedNetwork: string | undefined;

  // 1. Direct In-Page Browser / Testnet-Only RPC Query & Mainnet-Mismatch Detection
  if (chainType === "evm" && typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethProvider = (window as any).ethereum;
    if (ethProvider && typeof ethProvider.request === "function") {
      try {
        const cid = await ethProvider.request({ method: "eth_chainId" });
        if (typeof cid === "string") {
          inPageEthChainId = cid.toLowerCase();
          if (inPageEthChainId === "0xaa36a7") inPageDetectedNetwork = "Sepolia Testnet";
          else if (inPageEthChainId === "0x14a34") inPageDetectedNetwork = "Base Sepolia";
          else if (inPageEthChainId === "0x66eee") inPageDetectedNetwork = "Arbitrum Sepolia";
          else inPageDetectedNetwork = "EVM Mainnet (Switch to Sepolia)";
        }
      } catch {
        // Ignore chainId error and fall back to server Testnet RPCs
      }

      // Strictly query window.ethereum balances ONLY when active chain is a supported EVM Testnet
      if (inPageEthChainId && SUPPORTED_EVM_TESTNET_CHAIN_IDS.has(inPageEthChainId)) {
        try {
          const balHex = await ethProvider.request({
            method: "eth_getBalance",
            params: [address, "latest"],
          });
          inPageNative = parseHexToScaledNumber(balHex, 18);
        } catch {
          // Fallback to server Testnet RPC below
        }

        if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
          const padded = address.slice(2).toLowerCase().padStart(64, "0");
          const callData = `0x70a08231${padded}`;
          const usdcContract =
            inPageEthChainId === "0x14a34"
              ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
              : inPageEthChainId === "0x66eee"
                ? "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
                : "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

          try {
            const usdcHex = await ethProvider.request({
              method: "eth_call",
              params: [{ to: usdcContract, data: callData }, "latest"],
            });
            inPageUsdc = parseHexToScaledNumber(usdcHex, 6);
          } catch {
            inPageUsdc = null;
          }
        }
      }
    }
  } else if (chainType === "sui") {
    const stdWallet =
      activeSuiStandardWalletRef?.wallet ?? getRegisteredSuiStandardWallet();
    const stdAccount = activeSuiStandardWalletRef?.account ?? stdWallet?.accounts?.[0];
    inPageSuiActiveChain = detectSuiExplicitMainnetState(stdWallet, stdAccount);

    // Query STRICTLY Sui Testnet RPCs (https://fullnode.testnet.sui.io:443 + publicnode + suiscan) — never Mainnet
    const testnetSui = await querySuiTestnetMultiRpc(address);
    if (testnetSui.ok) {
      inPageNative = testnetSui.sui;
      inPageUsdc = testnetSui.usdc;
      inPageUsdt = testnetSui.usdt;
      inPageDetectedNetwork = inPageSuiActiveChain
        ? "Sui Mainnet (Switch to Testnet)"
        : "Sui Testnet";
    }
  } else if (chainType === "bitcoin" && typeof window !== "undefined") {
    if (isBitcoinTestnetAddress(address)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unisat = (window as any).unisat;
      if (unisat && typeof unisat.getBalance === "function") {
        try {
          const b = await unisat.getBalance();
          const totalSats = Number(b?.total ?? b?.confirmed ?? 0);
          if (Number.isFinite(totalSats) && totalSats >= 0) {
            inPageNative = Number((totalSats / 1e8).toFixed(8));
          }
        } catch {
          inPageNative = null;
        }
      }
      inPageDetectedNetwork = "Bitcoin Testnet";
    } else {
      inPageNative = 0;
      inPageDetectedNetwork = "Bitcoin Mainnet (Switch Required)";
    }
  } else if (chainType === "xrp" && typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const cmNet = String(win.crossmark?.session?.network?.type ?? "");
    if (cmNet) {
      inPageXrpNetworkType = cmNet;
    } else if (win.gemWallet && typeof win.gemWallet.getNetwork === "function") {
      try {
        const netResp = await win.gemWallet.getNetwork();
        inPageXrpNetworkType = String(netResp?.result?.network ?? "");
      } catch {
        // Ignore network probe error
      }
    }
  }

  const clientMismatch = evaluateWalletNetworkMismatch({
    chainType,
    address,
    evmChainIdHex: inPageEthChainId,
    suiActiveChain: inPageSuiActiveChain,
    xrpNetworkType: inPageXrpNetworkType,
  });

  // Short-circuit strict address-level Mainnet mismatches (NEAR .near, Bitcoin bc1/1/3, TON EQ/UQ) so Mainnet RPCs are never touched
  if (
    clientMismatch.isMainnetMismatch &&
    (chainType === "near" || chainType === "bitcoin" || chainType === "ton")
  ) {
    return {
      nativeSymbol,
      nativeBalance: 0,
      nativeFormatted: `0.0000 ${nativeSymbol}`,
      detectedNetwork:
        chainType === "near"
          ? "NEAR Mainnet (Switch Required)"
          : chainType === "bitcoin"
            ? "Bitcoin Mainnet (Switch Required)"
            : "TON Mainnet (Switch Required)",
      isMainnetMismatch: true,
      networkMismatchReason: clientMismatch.reason,
      ...(chainType === "near"
        ? {
            totalNearBalance: 0,
            spendableNearBalance: 0,
            totalNearFormatted: "0.0000 NEAR",
            spendableNearFormatted: "0.0000 NEAR",
          }
        : {}),
      wnearBalance: 0,
      usdcBalance: 0,
      usdtBalance: 0,
      tokenBalances: {
        [nativeSymbol]: 0,
        USDC: 0,
        USDT: 0,
      },
    };
  }

  // 2. Server-Side Testnet-Only RPC Balance Verification Across All 7 Chains
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
        nativeSymbol?: WalletNativeSymbol;
        nativeBalance?: number;
        detectedNetwork?: string;
        isMainnetMismatch?: boolean;
        networkMismatchReason?: string;
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

      const apiNative = Number(json.spendableNearBalance ?? json.nativeBalance ?? 0);
      const resolvedNative =
        inPageNative !== null ? Math.max(inPageNative, apiNative) : apiNative;
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
      const isMainnetMismatch = Boolean(
        clientMismatch.isMainnetMismatch || json.isMainnetMismatch
      );
      const networkMismatchReason =
        clientMismatch.reason ?? json.networkMismatchReason;
      const detectedNetwork = inPageDetectedNetwork ?? json.detectedNetwork;

      const mergedMap: Record<string, number> = {
        ...(json.tokenBalances ?? {}),
        [nativeSymbol]: resolvedNative,
        USDC: resolvedUsdc,
        "USDC-NEAR": chainType === "near" ? resolvedUsdc : 0,
        "USDC-BASE":
          chainType === "evm"
            ? Math.max(resolvedUsdc, Number(json.tokenBalances?.["USDC-BASE"] ?? 0))
            : 0,
        USDT: resolvedUsdt,
        "USDT-NEAR": chainType === "near" ? resolvedUsdt : 0,
        "USDT-ARBITRUM":
          chainType === "evm"
            ? Math.max(resolvedUsdt, Number(json.tokenBalances?.["USDT-ARBITRUM"] ?? 0))
            : 0,
      };
      if (chainType === "evm") {
        mergedMap.ETH = resolvedNative;
        mergedMap["ETH-ETHEREUM"] = resolvedNative;
      } else if (chainType === "near") {
        const combinedNearAndWnear = Number(
          ((resolvedSpendableNear ?? resolvedNative) + resolvedWnear).toFixed(4)
        );
        mergedMap.NEAR = resolvedSpendableNear ?? resolvedNative;
        mergedMap["NEAR-NEAR"] = combinedNearAndWnear;
        mergedMap.wNEAR = combinedNearAndWnear;
        mergedMap["wNEAR-NEAR"] = combinedNearAndWnear;
      } else if (chainType === "solana") {
        mergedMap.SOL = resolvedNative;
        mergedMap["SOL-SOLANA"] = resolvedNative;
      } else if (chainType === "bitcoin") {
        mergedMap.BTC = resolvedNative;
        mergedMap.WBTC = resolvedNative;
        mergedMap["BTC-BITCOIN"] = resolvedNative;
      } else if (chainType === "sui") {
        mergedMap.SUI = resolvedNative;
        mergedMap["SUI-SUI"] = resolvedNative;
      } else if (chainType === "ton") {
        mergedMap.TON = resolvedNative;
        mergedMap["TON-TON"] = resolvedNative;
      } else if (chainType === "xrp") {
        mergedMap.XRP = resolvedNative;
        mergedMap["XRP-RIPPLE"] = resolvedNative;
      }

      return {
        nativeSymbol,
        nativeBalance: resolvedNative,
        nativeFormatted: `${formatTokenAmountDisplay(resolvedNative, nativeSymbol)} ${nativeSymbol}`,
        detectedNetwork,
        isMainnetMismatch,
        networkMismatchReason,
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
    // Fall back to direct in-page Testnet numbers (0 if unavailable)
  }

  const fallbackNative = inPageNative ?? 0;
  const fallbackUsdc = inPageUsdc ?? 0;
  const fallbackUsdt = inPageUsdt ?? 0;

  return {
    nativeSymbol,
    nativeBalance: fallbackNative,
    nativeFormatted: `${formatTokenAmountDisplay(fallbackNative, nativeSymbol)} ${nativeSymbol}`,
    detectedNetwork: inPageDetectedNetwork,
    isMainnetMismatch: clientMismatch.isMainnetMismatch,
    networkMismatchReason: clientMismatch.reason,
    wnearBalance: 0,
    usdcBalance: fallbackUsdc,
    usdtBalance: fallbackUsdt,
    tokenBalances: {
      [nativeSymbol]: fallbackNative,
      ...(chainType === "evm" ? { "ETH-ETHEREUM": fallbackNative } : {}),
      ...(chainType === "near"
        ? {
            NEAR: fallbackNative,
            "NEAR-NEAR": fallbackNative,
            wNEAR: fallbackNative,
            "wNEAR-NEAR": fallbackNative,
          }
        : {}),
      ...(chainType === "solana" ? { "SOL-SOLANA": fallbackNative } : {}),
      ...(chainType === "bitcoin"
        ? { WBTC: fallbackNative, "BTC-BITCOIN": fallbackNative }
        : {}),
      ...(chainType === "sui" ? { SUI: fallbackNative, "SUI-SUI": fallbackNative } : {}),
      ...(chainType === "ton" ? { TON: fallbackNative, "TON-TON": fallbackNative } : {}),
      ...(chainType === "xrp" ? { XRP: fallbackNative, "XRP-RIPPLE": fallbackNative } : {}),
      USDC: fallbackUsdc,
      "USDC-NEAR": chainType === "near" ? fallbackUsdc : 0,
      "USDC-BASE": chainType === "evm" ? fallbackUsdc : 0,
      USDT: fallbackUsdt,
      "USDT-NEAR": chainType === "near" ? fallbackUsdt : 0,
      "USDT-ARBITRUM": chainType === "evm" ? fallbackUsdt : 0,
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
 * Triggers a REAL cryptographic signing popup in the user's connected personal wallet
 * on the specified chain (`near`, `evm`, `solana`, `bitcoin`, `sui`, `ton`, `xrp`).
 */
function extractIntentAmountFromMessage(
  message: string,
  fallbackAmount: string
): string {
  const payMatch = message.match(/"pay_amount":\s*"([0-9]+(?:\.[0-9]+)?)/i);
  if (payMatch && Number(payMatch[1]) > 0) return payMatch[1];
  const qtyMatch = message.match(/"sell_quantity_wnear":\s*"([0-9]+(?:\.[0-9]+)?)/i);
  if (qtyMatch && Number(qtyMatch[1]) > 0) return qtyMatch[1];
  return fallbackAmount;
}

export async function signMessageWithPersonalWallet(params: {
  address: string;
  chainType: WalletChainType;
  message: string;
  nearConnector: NearConnector | null;
  amount?: string | number;
  vaultAddress?: string;
}): Promise<{
  signature: string;
  txHash?: string;
  explorerTxUrl?: string;
  signerAddress: string;
  chainType: WalletChainType;
}> {
  const { address, chainType, message, nearConnector } = params;

  if (chainType === "evm") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethProvider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
    if (!ethProvider || typeof ethProvider.request !== "function") {
      throw new Error(
        "EVM wallet extension (Rabby / MetaMask) is not available in window.ethereum."
      );
    }
    let cidHex = "";
    try {
      const cid = await ethProvider.request({ method: "eth_chainId" });
      if (typeof cid === "string") cidHex = cid.toLowerCase();
    } catch {
      // Continue
    }
    if (cidHex && !SUPPORTED_EVM_TESTNET_CHAIN_IDS.has(cidHex)) {
      await requestBrowserWalletTestnetSwitch("evm");
      try {
        const cidAfter = await ethProvider.request({ method: "eth_chainId" });
        if (typeof cidAfter === "string") cidHex = cidAfter.toLowerCase();
      } catch {
        // Continue
      }
      if (cidHex && !SUPPORTED_EVM_TESTNET_CHAIN_IDS.has(cidHex)) {
        throw new WalletMainnetMismatchError(
          "[TESTNET MODE REQUIRED] Your EVM wallet is currently on Mainnet. Please switch to Testnet mode (Sepolia / Arbitrum Sepolia / Base Sepolia) to execute."
        );
      }
    }
    try {
      let txHashOrSig = "";
      const account = address;
      const vaultAddress = params.vaultAddress || account;
      const amount =
        params.amount !== undefined && Number(params.amount) > 0
          ? params.amount
          : extractIntentAmountFromMessage(message, "0.0001");
      const valueHex = "0x" + BigInt(Math.floor(Number(amount) * 1e18)).toString(16);
      try {
        const txRes = await ethProvider.request({
          method: "eth_sendTransaction",
          params: [{ from: account, to: vaultAddress, value: valueHex, gas: "0x5208" }],
        });
        if (typeof txRes === "string" && txRes.startsWith("0x") && txRes.length >= 20) {
          txHashOrSig = txRes.trim();
        }
      } catch (txErr) {
        if (isUserRejectionError(txErr)) {
          throw new WalletSignatureRejectedError();
        }
        // Fallback to personal_sign if eth_sendTransaction is unsupported or account has 0 ETH for gas
      }

      if (!txHashOrSig) {
        const hexMessage = utf8ToHex(message);
        const sig = await ethProvider.request({
          method: "personal_sign",
          params: [hexMessage, address],
        });
        if (typeof sig !== "string" || !sig.startsWith("0x") || sig.length < 20) {
          throw new WalletSignatureRejectedError();
        }
        txHashOrSig = sig.trim();
      }

      const detectedNet =
        cidHex === "0x14a34"
          ? "Base Sepolia"
          : cidHex === "0x66eee"
            ? "Arbitrum Sepolia"
            : "Ethereum Sepolia";
      const expInfo = getWalletExplorerTxInfo(txHashOrSig, "evm", detectedNet);
      return {
        signature: txHashOrSig,
        txHash: txHashOrSig,
        explorerTxUrl: expInfo.url,
        signerAddress: address,
        chainType: "evm",
      };
    } catch (err) {
      if (err instanceof WalletMainnetMismatchError) throw err;
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
      win?.phantom?.solana ??
      (win?.solana?.isPhantom ? win.solana : win?.solflare ?? win?.solana);
    if (!solProvider || typeof solProvider.signMessage !== "function") {
      throw new Error(
        "Solana wallet (Phantom / Solflare) is not available in window.phantom.solana."
      );
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
      const sigBase58 = encodeBytesBase58(rawSigBytes);
      const expInfo = getWalletExplorerTxInfo(sigBase58, "solana");
      return {
        signature: sigBase58,
        txHash: sigBase58,
        explorerTxUrl: expInfo.url,
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

  if (chainType === "bitcoin") {
    if (!isBitcoinTestnetAddress(address)) {
      throw new WalletMainnetMismatchError(
        `[TESTNET MODE REQUIRED] Your Bitcoin wallet is on Mainnet (${address}). Please switch UniSat/Xverse to Bitcoin Testnet mode (tb1...).`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== "undefined" ? (window as any) : {};
    if (win.unisat && typeof win.unisat.signMessage === "function") {
      try {
        const sig = await win.unisat.signMessage(message);
        if (!sig || typeof sig !== "string") {
          throw new WalletSignatureRejectedError();
        }
        const expInfo = getWalletExplorerTxInfo(sig, "bitcoin");
        return {
          signature: sig,
          txHash: sig,
          explorerTxUrl: expInfo.url,
          signerAddress: address,
          chainType: "bitcoin",
        };
      } catch (err) {
        if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
          throw new WalletSignatureRejectedError();
        }
        throw err;
      }
    }
    throw new Error(
      "Bitcoin wallet (UniSat / Xverse) signing provider is not available in browser."
    );
  }

  if (chainType === "sui") {
    try {
      const bytes = new TextEncoder().encode(message);
      let stdWallet =
        activeSuiStandardWalletRef?.wallet ?? getRegisteredSuiStandardWallet();
      if (!stdWallet && typeof window !== "undefined") {
        initWalletStandardRegistry();
        stdWallet = getRegisteredSuiStandardWallet();
      }
      if (stdWallet) {
        // Ensure Slush / Sui Wallet has populated its WalletAccount objects (with publicKey & chains)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const availableAccounts: any[] = Array.isArray(stdWallet.accounts)
          ? [...stdWallet.accounts]
          : [];
        if (
          availableAccounts.length === 0 &&
          !activeSuiStandardWalletRef?.account?.publicKey &&
          typeof stdWallet.features?.["standard:connect"]?.connect === "function"
        ) {
          const connectedRes = await stdWallet.features["standard:connect"].connect();
          if (Array.isArray(connectedRes?.accounts)) {
            availableAccounts.push(...connectedRes.accounts);
          }
          if (Array.isArray(stdWallet.accounts)) {
            for (const a of stdWallet.accounts) {
              if (!availableAccounts.includes(a)) availableAccounts.push(a);
            }
          }
        }

        const normTarget = normalizeSuiAddress(address);
        const matchedAccount =
          availableAccounts.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any) => normalizeSuiAddress(String(a?.address ?? "")) === normTarget
          ) ??
          (activeSuiStandardWalletRef?.account &&
          normalizeSuiAddress(String(activeSuiStandardWalletRef.account.address ?? "")) ===
            normTarget
            ? activeSuiStandardWalletRef.account
            : null) ??
          availableAccounts[0] ??
          activeSuiStandardWalletRef?.account ?? { address: normTarget || address };

        activeSuiStandardWalletRef = { wallet: stdWallet, account: matchedAccount };

        if (detectSuiExplicitMainnetState(stdWallet, matchedAccount)) {
          throw new WalletMainnetMismatchError(
            "[TESTNET MODE REQUIRED] Please switch Slush / Sui Wallet to Sui Testnet mode."
          );
        }

        const signPersonalFeature = stdWallet.features?.["sui:signPersonalMessage"];
        if (
          signPersonalFeature &&
          typeof signPersonalFeature.signPersonalMessage === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let signed: any = null;
          try {
            signed = await signPersonalFeature.signPersonalMessage({
              message: bytes,
              account: matchedAccount,
            });
          } catch (firstErr) {
            if (isUserRejectionError(firstErr)) {
              throw new WalletSignatureRejectedError();
            }
            signed = await signPersonalFeature.signPersonalMessage({
              message: bytes,
              account: matchedAccount,
              chain: "sui:testnet",
            });
          }
          const sig = String(signed?.signature ?? signed?.bytes ?? "");
          if (!sig) throw new WalletSignatureRejectedError();
          const expInfo = getWalletExplorerTxInfo(sig, "sui");
          return {
            signature: sig,
            txHash: sig,
            explorerTxUrl: expInfo.url,
            signerAddress:
              normalizeSuiAddress(String(matchedAccount?.address ?? address)) || address,
            chainType: "sui",
          };
        }

        const signMessageFeature = stdWallet.features?.["sui:signMessage"];
        if (signMessageFeature && typeof signMessageFeature.signMessage === "function") {
          const signed = await signMessageFeature.signMessage({
            message: bytes,
            account: matchedAccount,
          });
          const sig = String(signed?.signature ?? signed?.messageBytes ?? "");
          if (!sig) throw new WalletSignatureRejectedError();
          const expInfo = getWalletExplorerTxInfo(sig, "sui");
          return {
            signature: sig,
            txHash: sig,
            explorerTxUrl: expInfo.url,
            signerAddress:
              normalizeSuiAddress(String(matchedAccount?.address ?? address)) || address,
            chainType: "sui",
          };
        }
      }

      // Legacy fallback for window.slush / window.suiWallet / window.sui
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = typeof window !== "undefined" ? (window as any) : {};
      const suiProvider =
        win.slush ?? win.suiWallet ?? win.sui ?? win.suiet ?? win.nightly?.sui;
      if (String(suiProvider?.network ?? "").toLowerCase() === "mainnet") {
        throw new WalletMainnetMismatchError(
          "[TESTNET MODE REQUIRED] Please switch Slush / Sui Wallet to Sui Testnet mode."
        );
      }
      const signFn =
        suiProvider?.signPersonalMessage ?? suiProvider?.signMessage;
      if (!suiProvider || typeof signFn !== "function") {
        throw new Error(
          "Slush / Sui Wallet signing provider is not available in browser."
        );
      }
      const res = await signFn.call(suiProvider, {
        message: bytes,
        account: { address },
      });
      const sig = String(res?.signature ?? res?.bytes ?? "");
      if (!sig) throw new WalletSignatureRejectedError();
      const expInfo = getWalletExplorerTxInfo(sig, "sui");
      return {
        signature: sig,
        txHash: sig,
        explorerTxUrl: expInfo.url,
        signerAddress: address,
        chainType: "sui",
      };
    } catch (err) {
      if (err instanceof WalletMainnetMismatchError) throw err;
      if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
        throw new WalletSignatureRejectedError();
      }
      throw err;
    }
  }

  if (chainType === "ton") {
    if (address.startsWith("EQ") || address.startsWith("UQ")) {
      throw new WalletMainnetMismatchError(
        `[TESTNET MODE REQUIRED] Connected TON address (${address}) is on Mainnet. Please switch wallet to Testnet mode (0Q... / kQ...).`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== "undefined" ? (window as any) : {};
    const tonProvider = win.tonkeeper?.ton ?? win.ton;
    if (!tonProvider || typeof tonProvider.send !== "function") {
      throw new Error("TON Wallet signing provider is not available in browser.");
    }
    try {
      const hexData = utf8ToHex(message).slice(2);
      const sig = String(await tonProvider.send("ton_rawSign", [{ data: hexData }]));
      if (!sig) throw new WalletSignatureRejectedError();
      const expInfo = getWalletExplorerTxInfo(sig, "ton");
      return {
        signature: sig,
        txHash: sig,
        explorerTxUrl: expInfo.url,
        signerAddress: address,
        chainType: "ton",
      };
    } catch (err) {
      if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
        throw new WalletSignatureRejectedError();
      }
      throw err;
    }
  }

  if (chainType === "xrp") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== "undefined" ? (window as any) : {};
    const cmNet = String(win.crossmark?.session?.network?.type ?? "").toLowerCase();
    if (cmNet.includes("main") || cmNet.includes("live")) {
      throw new WalletMainnetMismatchError(
        "[TESTNET MODE REQUIRED] Connected XRPL wallet is on Mainnet. Please switch wallet to Testnet mode."
      );
    }
    try {
      if (win.crossmark && typeof win.crossmark.signMessageAsync === "function") {
        const resp = await win.crossmark.signMessageAsync(utf8ToHex(message).slice(2));
        const sig = String(resp?.response?.data?.signature ?? "");
        if (!sig) throw new WalletSignatureRejectedError();
        const expInfo = getWalletExplorerTxInfo(sig, "xrp");
        return {
          signature: sig,
          txHash: sig,
          explorerTxUrl: expInfo.url,
          signerAddress: address,
          chainType: "xrp",
        };
      }
      if (win.gemWallet && typeof win.gemWallet.signMessage === "function") {
        const resp = await win.gemWallet.signMessage(message);
        const sig = String(resp?.result?.signedMessage ?? "");
        if (!sig) throw new WalletSignatureRejectedError();
        const expInfo = getWalletExplorerTxInfo(sig, "xrp");
        return {
          signature: sig,
          txHash: sig,
          explorerTxUrl: expInfo.url,
          signerAddress: address,
          chainType: "xrp",
        };
      }
    } catch (err) {
      if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
        throw new WalletSignatureRejectedError();
      }
      throw err;
    }
    throw new Error("XRPL Wallet (Crossmark / GemWallet) is not available in browser.");
  }

  // NEAR Personal Wallet via @hot-labs/near-connect (Strictly .testnet or testnet implicit hex)
  if (address.toLowerCase().endsWith(".near")) {
    throw new WalletMainnetMismatchError(
      `[TESTNET MODE REQUIRED] Connected NEAR account (${address}) is on Mainnet. Please switch your wallet to Testnet mode (.testnet) to continue.`
    );
  }
  if (!nearConnector) {
    throw new Error(
      "NEAR wallet connector session not initialized. Please reconnect your NEAR wallet."
    );
  }
  try {
    const wallet = await nearConnector.wallet();
    const amount =
      params.amount !== undefined && Number(params.amount) > 0
        ? params.amount
        : extractIntentAmountFromMessage(message, "0.001");
    const depositYocto = BigInt(Math.floor(Number(amount) * 1e24)).toString();

    if (typeof wallet.signAndSendTransaction === "function") {
      const txOutcome = await wallet.signAndSendTransaction({
        signerId: address,
        receiverId: params.vaultAddress || "jubayir69.testnet",
        actions: [{ type: "Transfer", params: { deposit: depositYocto } }],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txHash = String(
        (txOutcome as any)?.transaction?.hash ??
          (txOutcome as any)?.transaction_outcome?.id ??
          ""
      );
      if (txHash) {
        return {
          signature: txHash,
          txHash,
          explorerTxUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
          signerAddress: address,
          chainType: "near",
        };
      }
    }

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

    throw new WalletSignatureRejectedError();
  } catch (err) {
    if (err instanceof WalletMainnetMismatchError) throw err;
    if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
      throw new WalletSignatureRejectedError();
    }
    throw err;
  }
}

/**
 * Triggers a FunctionCall `verify_and_anchor` on jubayir69.testnet from the connected NEAR wallet.
 * The JSON args are hMaster, hPolicy, and eip1186Verified. The attached deposit is 0.
 */
export async function sendNearTransactionWithPersonalWallet(params: {
  address: string;
  poc4HMaster: string;
  nearConnector: NearConnector | null;
  amount?: string | number;
  receiverId?: string;
}): Promise<{
  txHash: string;
  signerId: string;
  explorerTxUrl: string;
}> {
  const { address, nearConnector } = params;
  if (address.toLowerCase().endsWith(".near")) {
    throw new WalletMainnetMismatchError(
      `[TESTNET MODE REQUIRED] Connected NEAR account (${address}) is on Mainnet. Please switch your wallet to Testnet mode (.testnet) to continue.`
    );
  }
  if (!nearConnector) {
    throw new Error(
      "NEAR wallet connector session not initialized. Please reconnect your NEAR wallet."
    );
  }
  try {
    const nearConnect = await nearConnector.wallet();
    const outcome = await nearConnect.signAndSendTransaction({
      signerId: address,
      receiverId: params.receiverId || "jubayir69.testnet",
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "verify_and_anchor",
            args: {
              hMaster: params.poc4HMaster,
              hPolicy: "40b4ec314cdeec041edf22d20c4bb059ad9b288c055a4c8d463c57de1c3d68f6",
              eip1186Verified: true,
            },
            gas: "30000000000000",
            deposit: "0",
          },
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
    return {
      txHash,
      signerId: address,
      explorerTxUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
    };
  } catch (err) {
    if (err instanceof WalletMainnetMismatchError) throw err;
    if (err instanceof WalletSignatureRejectedError || isUserRejectionError(err)) {
      throw new WalletSignatureRejectedError();
    }
    throw err;
  }
}
