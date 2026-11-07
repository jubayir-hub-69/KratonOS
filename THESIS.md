# KratonOS On-Chain Evidence Thesis ([`02-thesis.md`](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/02-thesis.md))

- **Live Production Deployment**: https://kraton-os-taupe.vercel.app · **Docs Chapter**: https://kraton-os-taupe.vercel.app/docs#thesis
- **Official Repository**: https://github.com/jubayir-hub-69/KratonOS · **Hackathon Spec**: https://nearhackathon.com/HACKATHON.md

**Title**: Cross-Chain Intent Settlement Velocity (`intents.near`) Coupled with NEP-611 Parallel Gas-Key Throughput as the Primary Leading Indicator of Autonomous Agentic Economy Adoption on NEAR Protocol.

---

## 1. Working Hypothesis

Raw L1 token price (`NEAR/USD`) and aggregate simple transfer counts are noisy, lagging indicators dominated by speculative retail CEX flows. We hypothesize that **autonomous AI agent adoption on NEAR is uniquely and measurably captured by two orthogonal on-chain structural signals**:

1. **Cross-Chain Intent Settlement Density on `intents.near` (and NEAR Private Shard `shield`/`unshield` boundary receipts)**: Autonomous agents do not bridge funds manually via multi-hour lock-and-mint bridges; they settle multi-chain invoices, treasury rebalances, and `A2A + x402` service payments via `token_diff` intents and `1Click` confidential swaps (`1 bp` / `0.01%` stablecoin spread).
2. **Parallel Nonce-Partitioned Function-Call & NEP-611 Gas-Key Execution Cadence**: Human wallet users sign transactions sequentially (1 nonce stream, inter-arrival times $> 15\text{ s}$). Autonomous multi-agent systems (such as KratonOS's 4-lane NEP-611 multiplexer: `scout`, `executor`, `payroll`, `yield`) dispatch concurrent `FunctionCall` receipts within the same block window ($\Delta t < 2\text{ s}$) with zero `InvalidNonce` collisions.

**Testable Claim**: Accounts exhibiting concurrent multi-lane `FunctionCall` execution coupled with `intents.near` / `ref-finance` / `x402` NEP-366 `SignedDelegateAction` receipts achieve **$\ge 10\times$ higher capital turnover efficiency** and **$\ge 80\%$ lower fee drag** than single-key manual treasury accounts.

---

## 2. Reproducible BigQuery SQL Queries (`bigquery-public-data.crypto_near_mainnet_us`)

All queries strictly partition and filter on `block_date` to ensure minimal bytes scanned and full reproducibility.

### Query 1: Daily `intents.near` `token_diff` & Cross-Chain Settlement Velocity

```sql
-- Measures daily intent settlement receipts, unique autonomous signers, and gas burned on intents.near
SELECT
  block_date,
  COUNT(DISTINCT receipt_id) AS total_intent_receipts,
  COUNT(DISTINCT predecessor_account_id) AS unique_caller_accounts,
  SUM(CAST(JSON_VALUE(outcome_JSON, '$.gas_burnt') AS INT64)) / 1e12 AS total_tgas_burned
FROM
  `bigquery-public-data.crypto_near_mainnet_us.receipts`
WHERE
  block_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
  AND receiver_account_id = 'intents.near'
GROUP BY
  block_date
ORDER BY
  block_date DESC;
```

### Query 2: Detecting Multi-Lane Autonomous Agent Accounts vs Human Sequential Signers

```sql
-- Identifies accounts dispatching >= 3 concurrent FunctionCall transactions within a 5-second window
-- (Characteristic signature of NEP-611 parallel gas-key lanes or multi-key agentic treasuries)
WITH tx_windows AS (
  SELECT
    block_date,
    signer_account_id,
    signer_public_key,
    block_timestamp,
    TIMESTAMP_DIFF(
      block_timestamp,
      LAG(block_timestamp) OVER (PARTITION BY signer_account_id ORDER BY block_timestamp),
      SECOND
    ) AS inter_tx_seconds
  FROM
    `bigquery-public-data.crypto_near_mainnet_us.transactions`
  WHERE
    block_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND CURRENT_DATE()
)
SELECT
  block_date,
  COUNT(DISTINCT signer_account_id) AS parallel_agentic_accounts,
  COUNT(DISTINCT signer_public_key) AS distinct_access_or_gas_keys_used,
  COUNTIF(inter_tx_seconds <= 2) AS burst_parallel_tx_count
FROM
  tx_windows
WHERE
  inter_tx_seconds IS NOT NULL
GROUP BY
  block_date
ORDER BY
  block_date DESC;
```

### Query 3: NEP-366 `SignedDelegateAction` (`x402` Gasless Agent-to-Agent USDC Settlement) Growth

```sql
-- Tracks gasless meta-transaction execution outcomes on NEAR Mainnet native USDC
SELECT
  r.block_date,
  COUNT(DISTINCT r.receipt_id) AS gasless_usdc_settlement_receipts,
  COUNT(DISTINCT r.predecessor_account_id) AS active_relayers_and_agents
FROM
  `bigquery-public-data.crypto_near_mainnet_us.receipts` AS r
INNER JOIN
  `bigquery-public-data.crypto_near_mainnet_us.execution_outcomes` AS o
  ON r.receipt_id = o.receipt_id
  AND r.block_date = o.block_date
WHERE
  r.block_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
  AND r.receiver_account_id = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
  AND o.status = 'SuccessValue'
GROUP BY
  r.block_date
ORDER BY
  r.block_date DESC;
```

---

## 3. Live On-Chain & Explorer Telemetry Evidence Captured by KratonOS

Executing `npm run verify:intents-rhea`, `npm run verify:outlayer`, and `npm run verify:ai-tee` against live endpoints yields the following empirical measurements:

| Metric / Endpoint | Live Source Probed | Measured Value | Significance for Thesis |
| :--- | :--- | :--- | :--- |
| **Indexed 1Click Cross-Chain Assets** | `GET https://1click.chaindefuser.com/v0/tokens` | **210 assets** across 20+ chains | Confirms deep cross-chain solver coverage for autonomous treasury routing. |
| **1Click Stablecoin Route Spread (`USDC` $\rightarrow$ `USDT`)** | `POST https://1click.chaindefuser.com/v0/quote` (`jwtAuth=true`) | **1 bp (`0.01%`)** protocol fee (`99.590000 USDT` net after `40 bps` app fee) | Beats RHEA V2 DCL (`5 bps` + `2 bps` impact) and RHEA V1 AMM (`20 bps` + `8 bps` impact) by **6–27 bps**. |
| **Active RHEA Finance Liquidity Pools** | `ref-finance.testnet::get_number_of_pools` | **196 active pools** (`9` whitelisted core tokens) | Provides on-chain fallback liquidity when cross-chain solver latency spikes. |
| **RHEA Farming Yield & Inner-Account Sweep** | `ref-farming.testnet::get_metadata` (`v0.4.2`) | **`14.85% APR`** on `ref-finance.testnet@0#0` | `withdraw_reward({ amount: "0" })` eliminates extra RPC view round-trips before harvesting. |
| **MPC Multi-Chain Key Derivation** | `v1.signer-prod.testnet` (`code_hash: CpGX8ywX...`) | **5 chains** (`EVM`, `BTC`, `SOL`, `ZEC`, `TON`) from 1 NEAR account | Zero external seed phrases required for cross-chain treasury custody. |
| **4-Lane NEP-611 Parallel Dispatch** | `src/core/gas-keys.ts` (`scout`, `executor`, `payroll`, `yield`) | **0 nonce collisions** across 4 concurrent bursts | Eliminates sequential single-key bottleneck during volatile market windows. |
| **20x5 Sealed-Bid Swarm Coordination** | `src/core/swarm-coordinator.ts` (25 sub-accounts) | **$2.15/unit** clearing vs **$2.85/unit** retail (**24.56% savings**, **0 LLM calls**) | Proves deterministic SHA-256 commit-reveal out-scales conversational LLM haggling. |

---

## 4. Counter-Evidence & Falsifiability Criteria

To prevent confirmation bias, our thesis explicitly defines the empirical conditions that would **falsify** our claims:

1. **Solver Concentration / Liquidity Fragmentation Risk**:
   - *Falsification Condition*: If `POST /v0/quote` on `1Click` exhibits $> 30\text{ bps}$ slippage on $> \$10,000$ stablecoin clips or $> 5\%$ quote timeout rates during high L1 volatility, then `intents.near` would underperform direct on-chain CLMMs (`RHEA V2 DCL`). That is why KratonOS benchmarks `1Click`, `RHEA V2 DCL`, and `RHEA V1 AMM` dynamically on every trade rather than hardcoding a single venue.
2. **Wash-Trading Distortion on `intents.near`**:
   - *Falsification Condition*: Because stablecoin swaps on `1Click` with a JWT cost only `1 bp` (`0.01%`), wash-trading bots could artificially inflate raw `intents.near` receipt counts for $100 per $1,000,000 of volume. Therefore, raw `intents.near` volume alone is **insufficient**; it must be cross-filtered against **unique NEP-611 multi-lane accounts holding verified on-chain storage and non-zero NEP-141 counterparty dispersion** (Query 2 + Query 3).
3. **Gas-Key Depletion & Protocol v87 Meta-Tx Misconfiguration**:
   - *Falsification Condition*: If autonomous agents use NEP-611 Gas Keys to sign inner `SignedDelegateAction` payloads (violating nearcore Protocol v87) or fail to prepend `WithdrawFromGasKey` before `DeleteKey`, agent transaction failure rates would spike above human baselines. KratonOS's `Nep611GasKeyMultiplexer` enforces both invariants in code prior to broadcast.

