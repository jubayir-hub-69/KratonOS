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

KratonOS partitions autonomous treasury operations across 4 dedicated NEP-611 gas-key lanes under `jubayir69.testnet` to guarantee zero `InvalidNonce` collisions during parallel execution:

1. **Lane 0 — `scout.jubayir69.testnet` (Oracle & Market Discovery Agent)**:
   - Polls `market.near.ai` (`/v1/agents`, `/v1/jobs`), probes Ethereum Mainnet `eth_getProof` (EIP-1186) for Chainlink `ETH/USD` (`0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`), and aggregates multi-source median prices across Coinbase, 1Click (`210` tokens), and Kraken.
2. **Lane 1 — `executor.jubayir69.testnet` (PoC-4 Cross-Chain Intent Executor)**:
   - Verifies the Quad-Attested Proof of Constraint (`H_master`), benchmarks `1Click` Confidential Private Shard (`1 bp` stablecoin spread) against `RHEA V2 DCL` and `RHEA V1 AMM`, and submits confidential GTC limit orders (`/v0/orders`, `"confidentiality": "basic"`).
3. **Lane 2 — `payroll.jubayir69.testnet` (EXACT_OUTPUT Invoicing & Batch Payroll Relayer)**:
   - Computes `BigInt` ceiling gross-up invoices (`100.00%` net payout accuracy), probes `storage_balance_of`, auto-injects `0.00125 NEAR` `storage_deposit`, executes fault-isolated NEP-141 batch transfers (`<= 10` actions/chunk), and exports Bookkeeper Audit Ledger `.csv` and HTML/PDF audit statements.
4. **Lane 3 — `yield.jubayir69.testnet` (RHEA Farming & Multi-Chain MPC Custodian)**:
   - Harvests `ref-farming.testnet` LP rewards in 1 transaction via `withdraw_reward({ amount: "0" })` and derives `EVM`, `Bitcoin`, `Solana`, `Zcash`, and `TON` custody addresses via `v1.signer-prod.testnet`.

## 2. 3-Tier Earned-Trust Autonomy Boundary

- **Tier 1 — Always Autonomous (`<= $50.00` / `<= $150.00` Verified Counterparty)**:
  - Executes automatically when `emergency_kill_switch == false`, 4-Signal Risk Verdict == `allow`, oracle deviation `<= 5.0%`, and combined fee `<= 500 bps`.
- **Tier 2 — Single-Council Fast-Track (`$50.01 - $150.00` or `warn` Risk Score)**:
  - Queues a pre-verified PoC-4 execution bundle for single-council co-signature.
- **Tier 3 — Sputnik DAO V2 On-Chain Proposal (`> $150.00` / `> $500.00` or Policy Mutation)**:
  - Escalates via `escalate_dao_proposal` on `jubayir69.testnet` with a `1 NEAR` proposal bond (`1000000000000000000000000` yoctoNEAR) and SHA-256 operation commitment. Verified reference transaction `wKfp2jNxpFzEfryepmjsESVE2XiDfzXzFDtGWEeHZ9E`.
- **Never Without Human Confirmation**:
  - Rotating Full-Access recovery keys, disabling the 4-Signal Scam Shield, or deploying unverified WASM bytecode.

