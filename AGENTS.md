<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `npm exec --no -- intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npm exec --no -- intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

---

# KratonOS Multi-Agent Architecture & Autonomy Specification (`AGENTS.md`)

- **Live Production Deployment**: https://kraton-os-taupe.vercel.app
- **Live Documentation Portal**: https://kraton-os-taupe.vercel.app/docs
- **AI Judge Index (`llms.txt`)**: https://kraton-os-taupe.vercel.app/llms.txt
- **OpenAPI 3.1 Specification**: https://kraton-os-taupe.vercel.app/openapi.json
- **Official Repository**: https://github.com/jubayir-hub-69/KratonOS

## 1. 4-Lane NEP-611 Nonce-Isolated Sub-Agent Topology

KratonOS partitions autonomous treasury operations across 4 dedicated NEP-611 gas-key lanes (`scout.jubayir69.testnet`, `executor.jubayir69.testnet`, `payroll.jubayir69.testnet`, `yield.jubayir69.testnet`) operating as an off-chain deterministic nonce-isolation multiplexer (`100,000,001`..`400,000,001`) while on-chain transactions on NEAR Testnet are signed and settled by the primary vault account `jubayir69.testnet`:

1. **Lane 0 — `scout.jubayir69.testnet` (Oracle & Market Discovery Agent)**:
   - Polls `market.near.ai` (`/v1/agents`, `/v1/jobs`), probes Ethereum Mainnet `eth_getProof` (EIP-1186) for Chainlink `ETH/USD` (`0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`), and aggregates multi-source median prices across Coinbase, 1Click (`210` tokens), and Kraken.
2. **Lane 1 — `executor.jubayir69.testnet` (PoC-4 Cross-Chain Intent Executor)**:
   - Verifies the Quad-Attested Proof of Constraint (`H_master`), benchmarks `1Click` Confidential Private Shard (`1 bp` stablecoin solver spread + `40 bps` protocol fee = `41 bps` total fee) against `RHEA V2 DCL` and `RHEA V1 AMM`, and submits confidential GTC limit orders (`/v0/orders`, `"confidentiality": "basic"`, `TX: 2gjqSVvRhZtVYV6LuA8MHFutXRfFT5TLB8feCrzyYpgD`).
3. **Lane 2 — `payroll.jubayir69.testnet` (EXACT_OUTPUT Invoicing & Batch Payroll Relayer)**:
   - Computes `BigInt` ceiling gross-up invoices (`100.00%` net payout accuracy), probes `storage_balance_of`, auto-injects `0.00125 NEAR` `storage_deposit`, executes 11 fault-isolated `execute_payroll_row` cross-account transfers (`8R2ztw...` through `9iZT9g...`, `2.6400 NEAR` total across 7 verified recipients while quarantining Row #12), and exports Bookkeeper Audit Ledger `.csv` and HTML/PDF audit statements.
4. **Lane 3 — `yield.jubayir69.testnet` (RHEA Farming & Multi-Chain MPC Custodian)**:
   - Executes `harvest_yield_sweep` (`TX: ArNihHTyPzom5jHveNMcZSt3bkvzQCxFZUozfSpawT8v`, `0.0500 NEAR` cross-account transfer to `wrap.testnet`, child receipt `5MPert5BFEAUDdAaTkPkPWoRjLu4z1R3BANRZDB7zdt4`) while constructing the `ref-farming.testnet` `withdraw_reward({ amount: "0" })` action specification, and derives `EVM`, `Bitcoin`, `Solana`, `Zcash`, and `TON` custody addresses via `v1.signer-prod.testnet`.

## 2. 3-Tier Earned-Trust Autonomy Boundary

- **Tier 1 — Always Autonomous (`<= $50.00` / `<= $150.00` Verified Counterparty)**:
  - Executes automatically when `emergency_kill_switch == false`, 4-Signal Risk Verdict == `allow`, oracle deviation `<= 5.0%`, and combined fee `<= 500 bps`.
- **Tier 2 — Single-Council Fast-Track (`$50.01 - $150.00` or `warn` Risk Score)**:
  - Queues a pre-verified PoC-4 execution bundle for single-council co-signature.
- **Tier 3 — On-Chain Policy Vault Proposal Escalation (`> $150.00` / `> $500.00` or Policy Mutation)**:
  - Executes `FunctionCall(escalate_dao_proposal)` directly on the `jubayir69.testnet` Policy Vault contract (`contracts/kratonos_vault.wasm`, `code_hash: 8c77LmtTQePG2oJSzqHq9itY1SSVHn3GiuqFK3Agt1PD`, `8,680` bytes storage) with a `1 NEAR` proposal bond (`1000000000000000000000000` yoctoNEAR) and SHA-256 operation commitment, storing the proposal record in on-chain contract state and emitting a NEP-297 `EVENT_JSON` governance event rather than calling an external Sputnik DAO factory contract. Verified reference transaction `Dn1S4PjMxLeXX7EihmLLrLiPohv9cNFvEmhjnx7nUwoD` (Block `#277646089`).
- **Never Without Human Confirmation**:
  - Rotating Full-Access recovery keys, disabling the 4-Signal Scam Shield, or deploying unverified WASM bytecode.

