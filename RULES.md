# KratonOS Protocol Rules & Architectural Specification (`RULES.md`)

- **Live Production Deployment**: https://kraton-os-taupe.vercel.app · **Docs Portal**: https://kraton-os-taupe.vercel.app/docs
- **AI Judge Index & OpenAPI 3.1**: https://kraton-os-taupe.vercel.app/llms.txt · https://kraton-os-taupe.vercel.app/openapi.json
- **Official Repository & Hackathon Spec**: https://github.com/jubayir-hub-69/KratonOS · https://nearhackathon.com/HACKATHON.md

**KratonOS** is a hardware-attested, cryptographically constrained autonomous treasury and multi-agent operating system built on NEAR Protocol for the **NEAR Hackathon 2026**.

Every capital movement, cross-chain swap, DeFi yield allocation, and agentic bounty settlement in KratonOS is governed by deterministic on-chain constraints (`config.yaml` + `kratonos-policy-vault`), hardware enclave attestations, and non-bypassable protocol invariants.

---

## 0. Non-Negotiable Protocol Invariants

1. **Zero Mock / Zero Bypass Execution**:
   - All RPC state queries, cryptographic signatures (`ed25519` + FIPS 204 `ml-dsa-65`), TEE quote verifications, and 1Click/RHEA quotes execute against live endpoints and real cryptographic primitives.
2. **Rust Smart Contract Toolchain Lock (`1.86.0`)**:
   - The `kratonos-policy-vault` WASM contract toolchain is strictly locked to Rust `1.86.0` (the maximum toolchain version supported by the `nearcore` WASM runtime without incompatible bulk-memory/reference-types opcodes).
3. **Strict Single-Object NEAR JSON-RPC 2.0 Transport**:
   - `nearcore` JSON-RPC does **not** support JSON-RPC batch arrays. Every RPC call sends exactly **1 JSON-RPC 2.0 request object per HTTP POST**. Parallelism is achieved via concurrent HTTP requests across our 4 NEP-611 gas-key lanes (`lane_0` through `lane_3`).
4. **Confidential 1Click Swaps & Limit Orders**:
   - All 1Click swaps settle confidentially on the **NEAR Private Shard**. Public chain observability in `swapDetails.nearTxHashes` exposes only the `shield` and `unshield` boundary transaction hashes.
   - All 1Click Limit Orders (`POST /v0/orders`) explicitly enforce `"confidentiality": "basic"`.
5. **Hard Fee Ceiling (`<= 500 bps`)**:
   - Total combined fee (`appFees` + 1Click protocol fee) is mathematically bounded and verified prior to execution:
     $$\text{Fee}_{\text{total}} = \text{Fee}_{\text{app}} + \text{Fee}_{\text{1Click}} \le 500 \text{ bps } (5.00\%)$$
   - KratonOS defaults to `app_fee_bps: 40` (`0.40%`). Any quote whose combined fee exceeds `500` bps is immediately rejected by the PoC-4 gate.

---

## 1. PoC-4: Quad-Attested Proof of Constraint

No autonomous transaction, 1Click cross-chain swap, RHEA Finance liquidity action, or MPC Chain Signature request can be signed unless it produces a valid **Quad-Attested Proof of Constraint (`PoC-4`)** master commitment:

```text
H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE || RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)
```

### Component Definitions

| Component | Source | Cryptographic Binding |
| :--- | :--- | :--- |
| `Hash_Policy` | `config.yaml` + `kratonos-policy-vault` | Canonical SHA-256 digest of the active human constraints (`daily_spend_limit_usd`, `max_single_tx_usd`, `allowed_tokens`, `emergency_kill_switch == false`, `max_slippage_bps`). |
| `Sig_NEAR_AI_TEE` | NEAR AI Cloud (`cloud-api.near.ai/v1`) | Hardware-attested Intel TDX + NVIDIA H100/H200 TEE signature over the inference request/response (`zai-org/GLM-5.1-FP8`), proving the reasoning model was not tampered with or prompt-injected outside policy bounds. |
| `RTMR3_OutLayer_EIP1186` | OutLayer WASI P1/P2 (`outlayer.testnet`) | Runtime Measurement Register 3 (`RTMR3`) enclave measurement committed alongside the WASI P2 `eth_getProof` (EIP-1186 Merkle Patricia Trie storage proof) and median oracle price attestation (`deviation <= 5.0%`). |
| `Address_1Click_Quote` | NEAR Intents 1Click (`1click.chaindefuser.com`) | Deterministic deposit/settlement address and quote hash returned by `/v0/quote`, binding the exact input asset, output asset, slippage cap (`<= 100 bps`), and fee ceiling (`<= 500 bps`). |

### PoC-4 Verification & Dual-Signature Sequence Diagram

```text
+-------------------+     +--------------------+     +-----------------------+     +------------------------+
| KratonOS Executor |     |   NEAR AI Cloud    |     | OutLayer WASI Enclave |     | 1Click / RHEA / Policy |
| (NEP-611 Lane 1)  |     |  (TDX + GPU TEE)   |     | (P1 VRF + P2 EIP1186) |     |  Vault & Audit Log     |
+---------+---------+     +---------+----------+     +-----------+-----------+     +-----------+------------+
          |                         |                            |                             |
          | 1. Request intent plan  |                            |                             |
          |------------------------>|                            |                             |
          | 2. Signed Chat + Quote  |                            |                             |
          |<------------------------|                            |                             |
          |   (Sig_NEAR_AI_TEE)     |                            |                             |
          |                         |                            |                             |
          | 3. Verify cross-chain state (eth_getProof) & Oracle  |                             |
          |----------------------------------------------------->|                             |
          | 4. Return EIP-1186 Proof + Oracle Median + RTMR3     |                             |
          |<-----------------------------------------------------|                             |
          |   (RTMR3_OutLayer_EIP1186)                           |                             |
          |                         |                            |                             |
          | 5. Request confidential quote (dry: true / live)     |                             |
          |----------------------------------------------------------------------------------->|
          | 6. Return Deposit Address + Fee/Slippage Breakdown   |                             |
          |<-----------------------------------------------------------------------------------|
          |   (Address_1Click_Quote)                             |                             |
          |                         |                            |                             |
          | 7. Compute H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE ||                     |
          |                              RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)       |
          | 8. Co-sign H_master with Post-Quantum FIPS 204 ML-DSA-65 + NEAR ed25519            |
          | 9. Submit H_master proof to kratonos-policy-vault::verify_and_record_poc4          |
          |----------------------------------------------------------------------------------->|
```

---

## 2. 4-Signal Counterparty Risk & Scam Scorer (`allow` | `warn` | `block`)

Before any outbound transfer, bounty payout, or token swap is authorized, KratonOS evaluates the target account and token contract through a deterministic **4-Signal Counterparty Risk Engine**.

### The 4 Evaluation Signals

1. **Signal 1 — Account Age & Activity History (`S_age`)**:
   - Queries NEAR RPC (`view_account` and block/access-key history) to inspect account creation structure (named account vs. implicit 64-hex account), storage usage, balance stability, and historical transaction activity.
   - Freshly created accounts with zero history or dust-drainer patterns receive elevated risk penalties.
2. **Signal 2 — Contract Code Hash & Recent Code Change Check (`S_code`)**:
   - Inspects `code_hash` from NEAR RPC `view_account`.
   - Compares against known audited contract hashes (e.g., Sputnik DAO V2, RHEA Exchange, NEP-141 canonical wrappers) and flags unverified contracts or contracts whose `code_hash` recently mutated prior to a payout request.
3. **Signal 3 — Prior Agent-Receiver Interaction History (`S_history`)**:
   - Evaluates historical interaction records stored in the KratonOS policy vault and local audit ledger: prior successful deliveries, dispute rate, SLA fulfillment score, and earned-trust tier.
4. **Signal 4 — Evidence-Backed Shared Scam/Phishing Blocklist + RHEA `get_whitelisted_tokens` Check (`S_intel`)**:
   - Cross-references the target account/domain/contract against an evidence-backed scam/phishing signature database (typosquatted `.near`/`.testnet` accounts, known drainer contracts, malicious memo payloads).
   - Performs a live NEAR RPC `call_function` to RHEA Finance (`ref-finance.testnet` / `v2.ref-finance.near` -> `get_whitelisted_tokens`) to verify that any DeFi token contract is officially whitelisted.

### Decision Matrix

| Verdict | Risk Score Range | Enforcement Action |
| :--- | :--- | :--- |
| **`allow`** | `0 - 29` | Eligible for autonomous execution within `config.yaml` spend caps and Governance Tier rules. |
| **`warn`** | `30 - 69` | Blocks Tier 1 autonomous execution; automatically escalates to **Tier 2 (Single-Council Fast-Track)** or **Tier 3 (Sputnik DAO V2 Proposal)** with full risk evidence attached. |
| **`block`** | `70 - 100` (or hard blocklist hit) | Immediately aborts execution prior to signing, logs an immutable ML-DSA-65 signed security alert, and quarantines the counterparty. |

---

## 3. 3-Tier Earned-Trust Governance & Bounty Escalation (Sputnik DAO V2 & Trezu)

KratonOS combines high-velocity autonomous execution with institutional treasury safety via a **3-Tier Earned-Trust Governance Model** integrated with **Sputnik DAO V2** (`jubayir69.testnet`) and **Trezu** multisig treasury workflows.

### Governance Tiers

* **Tier 1 — Autonomous Fast-Lane (Auto-Approve)**:
  - **Criteria**: Counterparty Risk Verdict == `allow`, recipient is a high-reputation named account with established delivery history, transaction value $\le \$50.00$ (`tier_1_auto_approve_max_usd`), and total daily spend remains $\le \$500.00$ (`daily_spend_limit_usd`).
  - **Execution**: Signed immediately via assigned NEP-611 gas-key lane after PoC-4 verification.
* **Tier 2 — Single-Council Fast-Track**:
  - **Criteria**: Transaction value between $\$50.01$ and $\$150.00$ (`max_single_tx_usd`), or a first-time verified named counterparty with a low-to-moderate risk score (`warn` threshold under review).
  - **Execution**: Generates a pre-verified PoC-4 execution package requiring a single council co-approval signature before broadcast.
* **Tier 3 — Full DAO On-Chain Proposal (`escalate_dao_proposal` on `jubayir69.testnet`)**:
  - **Criteria**: Any transaction $> \$150.00$, any policy modification to `config.yaml`, any new token whitelist addition, or any escalated `warn` operation requiring full council consensus.
  - **Execution**: Automatically constructs and submits `escalate_dao_proposal` on `jubayir69.testnet` with:
    - **Attached Bond**: `1 NEAR` (`1000000000000000000000000` yoctoNEAR)
    - **Deterministic Description**: Includes the human-readable intent summary, the 4-Signal Risk Report, and the canonical **SHA-256 Operation Hash** (`op_hash = SHA256(CanonicalJSON(ProposalPayload))`) + `H_master` commitment.

### Governance Escalation Sequence Diagram

```text
+-------------------+     +-----------------------+     +------------------------+     +---------------------------+
|   Sub-Agent /     |     | 4-Signal Risk Engine  |     |  PoC-4 Policy Gate     |     | Sputnik DAO V2 / Trezu    |
|  Bounty Request   |     | (Allow / Warn / Block)|     |  (Tier Classifier)     |     | (jubayir69.testnet)  |
+---------+---------+     +-----------+-----------+     +-----------+------------+     +-------------+-------------+
          |                           |                             |                                |
          | 1. Submit Payout/Swap Req |                             |                                |
          |-------------------------->|                             |                                |
          | 2. Query RPC + RHEA       |                             |                                |
          |    get_whitelisted_tokens |                             |                                |
          |-------------------------->|                             |                                |
          |                           | 3. Emit Verdict + Evidence  |                                |
          |                           |---------------------------->|                                |
          |                           |                             |-- [If BLOCK] -> Halt & Log     |
          |                           |                             |                                |
          |                           |                             |-- [If Tier 1: <= $50 & ALLOW]  |
          |                           |                             |   Execute via NEP-611 Lane     |
          |                           |                             |                                |
          |                           |                             |-- [If Tier 2: <= $150]         |
          |                           |                             |   Queue Single-Council Signoff |
          |                           |                             |                                |
          |                           |                             |-- [If Tier 3: > $150 or Policy]|
          |                           |                             | 4. Call escalate_dao_proposal (1 NEAR) |
          |                           |                             |------------------------------->|
          |                           |                             |    with SHA-256 Op Hash        |
```

---

## 4. Swarm Sealed-Bid Coordination & 1-Round Counter-Offer Negotiation Loop

KratonOS operates as both an **Autonomous Buyer** (dispatching specialized sub-tasks) and an **Autonomous Worker** (monetizing TEE-verified research, cross-chain audits, and DeFi execution reports) using **A2A + HTTP 402 (`x402`)** payment headers and the **NEAR AI Agent Market** (`https://market.near.ai`).

### Mechanics

1. **OutLayer WASI P1 VRF Sealed-Bid Ordering & Tie-Breaking**:
   - When multiple worker agents submit sealed bids on `market.near.ai` or via A2A channels, KratonOS invokes the OutLayer WASI P1 verifiable random function (`VRF`) inside the TEE to eliminate front-running and deterministically break ties among equally scored bids.
2. **1-Round Counter-Offer Negotiation Loop**:
   - To prevent infinite negotiation gas/compute drain while maximizing treasury surplus, KratonOS enforces a strict **1-Round Counter-Offer Protocol**:
     - **Step A (Initial BidEvaluation)**: Given task valuation $V_{\text{task}}$ (bounded by `min_report_or_task_price_usd: 2.50` when selling, or task budget $B_{\text{max}}$ when buying) and worker ask $P_{\text{ask}}$:
       - If $P_{\text{ask}} \le P_{\text{target}}$, accept immediately.
       - If $P_{\text{target}} < P_{\text{ask}} \le B_{\text{max}}$, KratonOS issues **exactly 1 counter-offer** $P_{\text{counter}}$ signed with its TEE attestation.
     - **Step B (Final Resolution)**: If the counterparty accepts $P_{\text{counter}}$, settle via `x402` / `market.near.ai` escrow. If rejected, move immediately to the next ranked bidder or abort—never entering a multi-round haggling loop.
3. **Autonomous Revenue Split (`70 / 20 / 10`)**:
   - Every incoming `x402` or Agent Market bounty payment settled to KratonOS is automatically partitioned according to `config.yaml`:
     - **`70%` (`treasury_reserve`)**: Retained in `jubayir69.testnet` / Trezu sovereign reserve (and eligible for RHEA yield deployment via `lane_3`).
     - **`20%` (`sub_agent_bounty_pool`)**: Allocated to fund external sub-agent bounties on `market.near.ai`.
     - **`10%` (`compute_refill_pool`)**: Routed to replenish NEAR AI Cloud inference credits and NEP-611 gas-key lane allowances.

### Swarm Sealed-Bid & `x402` Settlement Sequence Diagram

```text
+-------------------+     +-----------------------+     +------------------------+     +---------------------------+
| KratonOS Buyer /  |     |  market.near.ai MCP   |     |   Worker Sub-Agents    |     |  x402 Payment & Revenue   |
| Orchestrator      |     |  & OutLayer P1 VRF    |     |   (A2A Bidders)        |     |  Splitter (70 / 20 / 10)  |
+---------+---------+     +-----------+-----------+     +-----------+------------+     +-------------+-------------+
          |                           |                             |                                |
          | 1. Post Task Spec + SLA   |                             |                                |
          |-------------------------->|                             |                                |
          |                           | 2. Broadcast RFP to Swarm   |                                |
          |                           |---------------------------->|                                |
          |                           | 3. Submit Sealed Bids       |                                |
          |                           |<----------------------------|                                |
          | 4. Unseal + VRF Rank Bids |                             |                                |
          |<--------------------------|                             |                                |
          |                           |                             |                                |
          | 5. [1-Round Counter-Offer Loop]                         |                                |
          |    Send Counter-Offer P_counter (if P_target < P_ask)   |                                |
          |-------------------------------------------------------->|                                |
          | 6. Accept P_counter + Deliver Output with HTTP 402      |                                |
          |<--------------------------------------------------------|                                |
          |                           |                             |                                |
          | 7. Verify Deliverable + PoC-4 + 4-Signal Risk Check     |                                |
          | 8. Settle x402 Escrow & Trigger 70/20/10 Revenue Split  |                                |
          |----------------------------------------------------------------------------------------->|
```

