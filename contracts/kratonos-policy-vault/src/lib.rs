use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, LookupSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near_bindgen, AccountId, Allowance, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PublicKey,
};
use sha2::{Digest as Sha2Digest, Sha256};
use sha3::Sha3_256;

/// NIST FIPS 204 ML-DSA-65 Public Key Size (1,952 bytes)
pub const MLDSA65_PUBKEY_LEN: usize = 1952;
/// NEAR Domain Separation Tag for Post-Quantum ML-DSA-65 Key Hashing
pub const MLDSA65_DOMAIN_TAG: &[u8] = b"near:ml-dsa-65-pubkey-hash:v1";
/// Nanoseconds per UTC Day (86,400 * 10^9)
pub const NANOS_PER_DAY: u64 = 86_400_000_000_000;
/// Hard Protocol Ceiling for Combined App + 1Click Fees (500 bps = 5.00%)
pub const MAX_TOTAL_FEE_BPS: u16 = 500;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    AgentReputations,
    ExecutedMasterHashes,
    AgentBounties,
}

/// 5 x 48-byte (96-hex-char) Intel TDX Hardware Attestation Registers
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct TdxMeasurements {
    pub mrtd: String,
    pub rtmr0: String,
    pub rtmr1: String,
    pub rtmr2: String,
    pub rtmr3: String,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum BountyStatus {
    Open,
    Claimed,
    Completed,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AgentBounty {
    pub bounty_id: u64,
    pub title: String,
    pub reward_usd_cents: u64,
    pub reward_yocto: U128,
    pub worker_id: Option<AccountId>,
    pub deliverable_sha256: Option<String>,
    pub status: BountyStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct IntentExecutionOutcome {
    pub tier: String,
    pub decision: String,
    pub h_master: String,
    pub operation_sha256: String,
    pub updated_reputation: u16,
    pub escalated_to_dao: bool,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct KratonPolicyVault {
    pub owner_id: AccountId,
    pub sputnik_dao_id: AccountId,
    pub outlayer_contract_id: AccountId,
    pub outlayer_worker_contract_id: AccountId,
    pub mpc_signer_id: AccountId,
    pub emergency_kill_switch: bool,
    pub daily_spend_limit_usd_cents: u64,
    pub max_single_tx_usd_cents: u64,
    pub current_day_spend_usd_cents: u64,
    pub last_reset_day_index: u64,
    pub max_slippage_bps: u16,
    pub whitelisted_tokens: Vec<String>,
    pub blocked_counterparties: Vec<AccountId>,
    pub agent_reputations: LookupMap<AccountId, u16>,
    pub approved_tdx_measurements: TdxMeasurements,
    pub executed_master_hashes: LookupSet<String>,
    pub agent_bounties: LookupMap<u64, AgentBounty>,
    pub next_bounty_id: u64,
    pub vault_locked: bool,
}

#[near_bindgen]
impl KratonPolicyVault {
    #[init]
    pub fn new(
        owner_id: AccountId,
        sputnik_dao_id: AccountId,
        outlayer_contract_id: AccountId,
        outlayer_worker_contract_id: AccountId,
        mpc_signer_id: AccountId,
        daily_spend_limit_usd_cents: u64,
        max_single_tx_usd_cents: u64,
        max_slippage_bps: u16,
        approved_tdx_measurements: TdxMeasurements,
    ) -> Self {
        assert!(
            max_single_tx_usd_cents > 0 && max_single_tx_usd_cents <= daily_spend_limit_usd_cents,
            "Invalid spend limits: max_single_tx_usd_cents must be > 0 and <= daily_spend_limit_usd_cents"
        );
        assert!(
            max_slippage_bps <= 500,
            "Invalid max_slippage_bps: cannot exceed 500 bps"
        );
        Self::assert_valid_tdx_measurements(&approved_tdx_measurements);

        let mut agent_reputations = LookupMap::new(StorageKey::AgentReputations);
        // Seed owner and default NEP-611 lane sub-accounts with earned-trust reputation (750/1000)
        agent_reputations.insert(&owner_id, &750u16);
        for prefix in ["scout", "executor", "payroll", "yield"] {
            if let Ok(lane_id) = format!("{}.{}", prefix, owner_id).parse::<AccountId>() {
                agent_reputations.insert(&lane_id, &750u16);
            }
        }

        let blocked_counterparties = vec![
            "scam-drainer-vault.testnet".parse().unwrap(),
            "phishing-airdrop-claim.testnet".parse().unwrap(),
        ];

        let whitelisted_tokens = vec![
            "USDC".to_string(),
            "USDT".to_string(),
            "DAI".to_string(),
            "NEAR".to_string(),
            "wNEAR".to_string(),
            "ETH".to_string(),
            "WBTC".to_string(),
            "SOL".to_string(),
            "ZEC".to_string(),
        ];

        Self {
            owner_id,
            sputnik_dao_id,
            outlayer_contract_id,
            outlayer_worker_contract_id,
            mpc_signer_id,
            emergency_kill_switch: false,
            daily_spend_limit_usd_cents,
            max_single_tx_usd_cents,
            current_day_spend_usd_cents: 0,
            last_reset_day_index: env::block_timestamp() / NANOS_PER_DAY,
            max_slippage_bps,
            whitelisted_tokens,
            blocked_counterparties,
            agent_reputations,
            approved_tdx_measurements,
            executed_master_hashes: LookupSet::new(StorageKey::ExecutedMasterHashes),
            agent_bounties: LookupMap::new(StorageKey::AgentBounties),
            next_bounty_id: 1,
            vault_locked: false,
        }
    }

    /// Toggles the emergency kill switch (restricted to `owner_id` or `sputnik_dao_id` council).
    pub fn set_emergency_kill_switch(&mut self, active: bool) {
        self.assert_owner_or_dao();
        self.emergency_kill_switch = active;
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"kratonos\",\"version\":\"1.0.0\",\"event\":\"kill_switch_updated\",\"data\":{{\"active\":{}}}}}",
            active
        ));
    }

    /// Computes deterministic SHA-256 hex digest of the active on-chain policy constraints.
    pub fn compute_policy_hash(&self) -> String {
        let preimage = format!(
            "owner:{}|dao:{}|outlayer:{}|worker:{}|mpc:{}|kill:{}|locked:{}|daily:{}|single:{}|slippage:{}|tokens:{}",
            self.owner_id,
            self.sputnik_dao_id,
            self.outlayer_contract_id,
            self.outlayer_worker_contract_id,
            self.mpc_signer_id,
            self.emergency_kill_switch,
            self.vault_locked,
            self.daily_spend_limit_usd_cents,
            self.max_single_tx_usd_cents,
            self.max_slippage_bps,
            self.whitelisted_tokens.join(",")
        );
        hex_encode(&Sha256::digest(preimage.as_bytes()))
    }

    /// Verifies the Quad-Attested Proof of Constraint (`PoC-4`) gate:
    /// `H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE || RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)`
    /// Enforces caller authorization, vault lock, replay protection, kill switch, slippage cap, fee cap (<= 500 bps), token whitelist, and counterparty blocklist.
    pub fn verify_poc4_enclave_gate(
        &mut self,
        sig_near_ai_tee: String,
        rtmr3_outlayer_eip1186: String,
        address_1click_quote: String,
        token_symbol: String,
        receiver_id: AccountId,
        slippage_bps: u16,
        total_fee_bps: u16,
    ) -> String {
        self.assert_authorized_caller(None);
        assert!(
            !self.vault_locked,
            "POC4_REJECTED: Vault account is locked"
        );
        assert!(
            !self.emergency_kill_switch,
            "POC4_REJECTED: Emergency kill switch is active"
        );
        assert!(
            !self.blocked_counterparties.contains(&receiver_id),
            "POC4_REJECTED: Counterparty '{}' is on the security blocklist",
            receiver_id
        );
        assert!(
            slippage_bps <= self.max_slippage_bps,
            "POC4_REJECTED: Slippage {} bps exceeds max_slippage_bps ({})",
            slippage_bps,
            self.max_slippage_bps
        );
        assert!(
            total_fee_bps <= MAX_TOTAL_FEE_BPS,
            "POC4_REJECTED: Total fee {} bps exceeds protocol ceiling ({} bps)",
            total_fee_bps,
            MAX_TOTAL_FEE_BPS
        );
        assert!(
            self.whitelisted_tokens.iter().any(|t| t.eq_ignore_ascii_case(&token_symbol)),
            "POC4_REJECTED: Token '{}' is not in whitelisted_tokens",
            token_symbol
        );
        assert!(
            !sig_near_ai_tee.trim().is_empty()
                && !rtmr3_outlayer_eip1186.trim().is_empty()
                && !address_1click_quote.trim().is_empty(),
            "POC4_REJECTED: All 4 attestation inputs must be non-empty"
        );
        assert!(
            rtmr3_outlayer_eip1186.eq_ignore_ascii_case(&self.approved_tdx_measurements.rtmr3),
            "POC4_REJECTED: OutLayer RTMR3 measurement mismatch against approved TDX register"
        );

        let normalized_rtmr3 = rtmr3_outlayer_eip1186.to_ascii_lowercase();
        let hash_policy = self.compute_policy_hash();
        let master_preimage = format!(
            "{}||{}||{}||{}",
            hash_policy, sig_near_ai_tee, normalized_rtmr3, address_1click_quote
        );
        let h_master = hex_encode(&Sha256::digest(master_preimage.as_bytes()));

        assert!(
            !self.executed_master_hashes.contains(&h_master),
            "POC4_REPLAY_DETECTED: H_master '{}' has already been executed",
            h_master
        );
        self.executed_master_hashes.insert(&h_master);

        h_master
    }

    /// Post-Quantum (NIST FIPS 204 `ml-dsa-65`) on-chain domain digest verifier:
    /// Prepends `"near:ml-dsa-65-pubkey-hash:v1"` to the 1952-byte public key,
    /// computes `SHA3-256` (32 bytes), and verifies `ml-dsa-65-hash:<base58>`.
    pub fn verify_mldsa65_domain_digest(
        &self,
        pubkey_bytes: Vec<u8>,
        expected_base58_hash: String,
    ) -> bool {
        if pubkey_bytes.len() != MLDSA65_PUBKEY_LEN {
            return false;
        }
        let mut hasher = Sha3_256::new();
        hasher.update(MLDSA65_DOMAIN_TAG);
        hasher.update(&pubkey_bytes);
        let digest = hasher.finalize();
        let computed = format!("ml-dsa-65-hash:{}", bs58::encode(digest).into_string());
        computed == expected_base58_hash
    }

    /// OutLayer Provable VRF Verifier (~1 TGas via `env::ed25519_verify`):
    /// Verifies `alpha = format!("vrf:{}:{}:{}", request_id, sender_id, seed)` against the
    /// 32-byte Ed25519 VRF public key and 64-byte signature, returning `SHA256(signature)`
    /// for deterministic anti-MEV order slicing jitter.
    pub fn verify_outlayer_vrf(
        &self,
        vrf_pubkey: Vec<u8>,
        request_id: u64,
        sender_id: AccountId,
        seed: String,
        signature: Vec<u8>,
    ) -> Vec<u8> {
        let pubkey_arr: [u8; 32] = vrf_pubkey
            .try_into()
            .expect("VRF public key must be exactly 32 bytes");
        let sig_arr: [u8; 64] = signature
            .clone()
            .try_into()
            .expect("VRF Ed25519 signature must be exactly 64 bytes");

        let alpha = format!("vrf:{}:{}:{}", request_id, sender_id, seed);
        let verified = env::ed25519_verify(&sig_arr, alpha.as_bytes(), &pubkey_arr);
        assert!(verified, "OUTLAYER_VRF_INVALID: Ed25519 VRF signature verification failed");

        Sha256::digest(&signature).to_vec()
    }

    /// Scoped Function-Call Access Key Registration:
    /// Protocol Rule: Inside WASM contract host function `promise_batch_action_add_key_with_function_call`,
    /// passing `0` for `allowance` means UNLIMITED allowance (`Allowance::Unlimited`).
    /// By contrast, in an external transaction `AddKey` action, `0` sets a literal 0 yoctoNEAR allowance
    /// and causes `NotEnoughAllowance` on the very first call (`null`/omitted is required externally for unlimited).
    pub fn register_scoped_agent_key(
        &mut self,
        agent_pubkey: PublicKey,
        receiver_id: AccountId,
        method_names: String,
        allowance_yocto: U128,
    ) -> Promise {
        self.assert_owner_or_dao();
        assert!(!self.vault_locked, "Vault account is locked");

        let allowance = if allowance_yocto.0 == 0 {
            Allowance::Unlimited
        } else {
            Allowance::limited(NearToken::from_yoctonear(allowance_yocto.0))
                .unwrap_or(Allowance::Unlimited)
        };

        Promise::new(env::current_account_id()).add_access_key_allowance(
            agent_pubkey,
            allowance,
            receiver_id,
            method_names,
        )
    }

    /// 3-Tier Earned-Trust Governance & Intent Execution Engine:
    /// - Blocked counterparty -> slashes agent reputation (-250) and panics/rejects.
    /// - Tier 1 (`AUTO_APPROVE`): `amount_usd_cents <= max_single_tx_usd_cents` AND `reputation >= 700`
    ///   AND within `daily_spend_limit_usd_cents` -> records spend, boosts reputation (`+5` up to 1000),
    ///   and emits NEP-297 `intent_approved` event.
    /// - Tier 2 (`ONE_COUNCIL_FAST_TRACK`) & Tier 3 (`SPUTNIK_DAO_PROPOSAL`): constructs a cross-contract
    ///   `escalate_dao_proposal` call on jubayir69.testnet (`1 NEAR` bond, `150 TGas`) with the SHA-256 operation hash.
    pub fn execute_or_escalate_intent(
        &mut self,
        agent_id: AccountId,
        receiver_id: AccountId,
        token_symbol: String,
        amount_usd_cents: u64,
        amount_yocto: U128,
        intent_summary: String,
        sig_near_ai_tee: String,
        rtmr3_outlayer_eip1186: String,
        address_1click_quote: String,
        slippage_bps: u16,
        total_fee_bps: u16,
    ) -> IntentExecutionOutcome {
        assert!(!self.emergency_kill_switch, "Emergency kill switch is active");
        assert!(!self.vault_locked, "Vault account is locked");
        self.assert_authorized_caller(Some(&agent_id));
        assert!(
            amount_usd_cents > 0 && amount_yocto.0 > 0,
            "Amount in USD cents and yocto/atomic units must be strictly positive"
        );

        // Roll daily spend window if UTC day advanced
        let current_day = env::block_timestamp() / NANOS_PER_DAY;
        if current_day > self.last_reset_day_index {
            self.current_day_spend_usd_cents = 0;
            self.last_reset_day_index = current_day;
        }

        let current_rep = self.agent_reputations.get(&agent_id).unwrap_or(750);

        // Check counterparty blocklist -> slash reputation on violation
        if self.blocked_counterparties.contains(&receiver_id) {
            let slashed = current_rep.saturating_sub(250);
            self.agent_reputations.insert(&agent_id, &slashed);
            env::log_str(&format!(
                "EVENT_JSON:{{\"standard\":\"kratonos\",\"version\":\"1.0.0\",\"event\":\"counterparty_blocked\",\"data\":{{\"agent_id\":\"{}\",\"receiver_id\":\"{}\",\"slashed_reputation\":{}}}}}",
                agent_id, receiver_id, slashed
            ));
            return IntentExecutionOutcome {
                tier: "BLOCKED".to_string(),
                decision: "block".to_string(),
                h_master: "BLOCKED".to_string(),
                operation_sha256: "BLOCKED".to_string(),
                updated_reputation: slashed,
                escalated_to_dao: false,
            };
        }

        let h_master = self.verify_poc4_enclave_gate(
            sig_near_ai_tee,
            rtmr3_outlayer_eip1186,
            address_1click_quote,
            token_symbol.clone(),
            receiver_id.clone(),
            slippage_bps,
            total_fee_bps,
        );

        let op_preimage = format!(
            "{}|{}|{}|{}|{}|{}",
            agent_id, receiver_id, token_symbol, amount_usd_cents, amount_yocto.0, h_master
        );
        let operation_sha256 = hex_encode(&Sha256::digest(op_preimage.as_bytes()));

        let projected_daily = self
            .current_day_spend_usd_cents
            .checked_add(amount_usd_cents)
            .expect("Daily spend USD cents overflow");

        // Tier 1: Autonomous Fast-Lane
        if amount_usd_cents <= self.max_single_tx_usd_cents
            && projected_daily <= self.daily_spend_limit_usd_cents
            && current_rep >= 700
        {
            self.current_day_spend_usd_cents = projected_daily;
            let new_rep = std::cmp::min(1000, current_rep.saturating_add(5));
            self.agent_reputations.insert(&agent_id, &new_rep);

            env::log_str(&format!(
                "EVENT_JSON:{{\"standard\":\"kratonos\",\"version\":\"1.0.0\",\"event\":\"intent_approved\",\"data\":{{\"tier\":\"AUTO_APPROVE\",\"agent_id\":\"{}\",\"receiver_id\":\"{}\",\"amount_usd_cents\":{},\"h_master\":\"{}\",\"operation_sha256\":\"{}\",\"reputation\":{}}}}}",
                agent_id, receiver_id, amount_usd_cents, h_master, operation_sha256, new_rep
            ));

            return IntentExecutionOutcome {
                tier: "AUTO_APPROVE".to_string(),
                decision: "allow".to_string(),
                h_master,
                operation_sha256,
                updated_reputation: new_rep,
                escalated_to_dao: false,
            };
        }

        // Tier 2 (medium reputation within single-tx & daily caps) vs Tier 3 (> $150 single-tx, > $500 daily, or < 400 reputation)
        let tier = if amount_usd_cents <= self.max_single_tx_usd_cents
            && projected_daily <= self.daily_spend_limit_usd_cents
            && current_rep >= 400
        {
            "ONE_COUNCIL_FAST_TRACK"
        } else {
            "SPUTNIK_DAO_PROPOSAL"
        };

        let proposal_payload = serde_json::json!({
            "proposal": {
                "description": format!(
                    "[KratonOS {}] {} ||SHA256_OP_HASH: {} ||POC4_H_MASTER: {}",
                    tier, intent_summary, operation_sha256, h_master
                ),
                "kind": {
                    "Transfer": {
                        "token_id": "",
                        "receiver_id": receiver_id,
                        "amount": amount_yocto.0.to_string(),
                        "msg": null
                    }
                }
            }
        });

        if env::prepaid_gas() >= Gas::from_tgas(180)
            && env::account_balance() >= NearToken::from_near(2)
        {
            let _ = Promise::new(self.sputnik_dao_id.clone()).function_call(
                "escalate_dao_proposal".to_string(),
                proposal_payload.to_string().into_bytes(),
                NearToken::from_near(1),
                Gas::from_tgas(150),
            );
        }

        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"kratonos\",\"version\":\"1.0.0\",\"event\":\"intent_escalated_to_dao\",\"data\":{{\"tier\":\"{}\",\"dao_id\":\"{}\",\"amount_usd_cents\":{},\"h_master\":\"{}\",\"operation_sha256\":\"{}\"}}}}",
            tier, self.sputnik_dao_id, amount_usd_cents, h_master, operation_sha256
        ));

        IntentExecutionOutcome {
            tier: tier.to_string(),
            decision: "warn".to_string(),
            h_master,
            operation_sha256,
            updated_reputation: current_rep,
            escalated_to_dao: true,
        }
    }

    /// Posts an autonomous sub-agent bounty on the Policy Vault.
    pub fn post_agent_bounty(
        &mut self,
        title: String,
        reward_usd_cents: u64,
        reward_yocto: U128,
    ) -> u64 {
        self.assert_owner_or_dao();
        assert!(!self.vault_locked, "Vault account is locked");
        assert!(
            !title.trim().is_empty() && reward_usd_cents > 0 && reward_yocto.0 > 0,
            "Invalid bounty parameters: title and rewards must be non-empty and positive"
        );
        let bounty_id = self.next_bounty_id;
        self.next_bounty_id = self
            .next_bounty_id
            .checked_add(1)
            .expect("Bounty ID counter overflow");

        let bounty = AgentBounty {
            bounty_id,
            title,
            reward_usd_cents,
            reward_yocto,
            worker_id: None,
            deliverable_sha256: None,
            status: BountyStatus::Open,
        };
        self.agent_bounties.insert(&bounty_id, &bounty);
        bounty_id
    }

    /// Claims an open sub-agent bounty.
    pub fn claim_agent_bounty(&mut self, bounty_id: u64, worker_id: AccountId) {
        assert!(!self.vault_locked, "Vault account is locked");
        assert!(!self.emergency_kill_switch, "Emergency kill switch is active");
        let caller = env::predecessor_account_id();
        assert!(
            caller == worker_id || caller == self.owner_id || caller == self.sputnik_dao_id,
            "UNAUTHORIZED: Caller '{}' cannot claim bounty on behalf of '{}'",
            caller,
            worker_id
        );
        assert!(
            !self.blocked_counterparties.contains(&worker_id),
            "SECURITY_BLOCKED: Blocked counterparty '{}' cannot claim bounties",
            worker_id
        );
        let mut bounty = self
            .agent_bounties
            .get(&bounty_id)
            .expect("Bounty does not exist");
        assert_eq!(bounty.status, BountyStatus::Open, "Bounty is not open");
        bounty.worker_id = Some(worker_id);
        bounty.status = BountyStatus::Claimed;
        self.agent_bounties.insert(&bounty_id, &bounty);
    }

    /// Completes a claimed bounty and records the deliverable SHA-256 proof.
    pub fn complete_agent_bounty(&mut self, bounty_id: u64, deliverable_sha256: String) {
        assert!(!self.vault_locked, "Vault account is locked");
        assert!(!self.emergency_kill_switch, "Emergency kill switch is active");
        assert!(
            deliverable_sha256.len() == 64
                && deliverable_sha256.chars().all(|c| c.is_ascii_hexdigit()),
            "Deliverable SHA-256 must be a valid 64-character hex digest"
        );
        let mut bounty = self
            .agent_bounties
            .get(&bounty_id)
            .expect("Bounty does not exist");
        assert_eq!(bounty.status, BountyStatus::Claimed, "Bounty must be claimed first");
        let caller = env::predecessor_account_id();
        let is_assigned_worker = bounty
            .worker_id
            .as_ref()
            .map(|w| *w == caller)
            .unwrap_or(false);
        assert!(
            is_assigned_worker || caller == self.owner_id || caller == self.sputnik_dao_id,
            "UNAUTHORIZED: Only assigned worker, owner, or Sputnik DAO can complete bounty"
        );
        bounty.deliverable_sha256 = Some(deliverable_sha256.to_ascii_lowercase());
        bounty.status = BountyStatus::Completed;
        self.agent_bounties.insert(&bounty_id, &bounty);
    }

    /// Protocol v2.6 Global Contract / Immutable Vault Locking semantics.
    pub fn lock_vault_account(&mut self) {
        self.assert_owner_or_dao();
        self.vault_locked = true;
        env::log_str("EVENT_JSON:{\"standard\":\"kratonos\",\"version\":\"1.0.0\",\"event\":\"vault_locked\",\"data\":{\"locked\":true}}");
    }

    pub fn get_agent_reputation(&self, agent_id: AccountId) -> u16 {
        self.agent_reputations.get(&agent_id).unwrap_or(750)
    }

    fn is_registered_agent(&self, account_id: &AccountId) -> bool {
        if self.agent_reputations.contains_key(account_id) {
            return true;
        }
        for prefix in ["scout", "executor", "payroll", "yield"] {
            if account_id.as_str() == format!("{}.{}", prefix, self.owner_id) {
                return true;
            }
        }
        false
    }

    fn assert_authorized_caller(&self, expected_agent_id: Option<&AccountId>) {
        let caller = env::predecessor_account_id();
        if caller == self.owner_id
            || caller == self.sputnik_dao_id
            || caller == env::current_account_id()
        {
            return;
        }
        if let Some(agent_id) = expected_agent_id {
            assert!(
                caller == *agent_id && self.is_registered_agent(&caller),
                "UNAUTHORIZED: Caller '{}' is not authorized to execute intent for '{}'",
                caller,
                agent_id
            );
        } else {
            assert!(
                self.is_registered_agent(&caller),
                "UNAUTHORIZED: Caller '{}' is not a registered Policy Vault agent or owner",
                caller
            );
        }
    }

    fn assert_owner_or_dao(&self) {
        let caller = env::predecessor_account_id();
        assert!(
            caller == self.owner_id || caller == self.sputnik_dao_id,
            "UNAUTHORIZED: Only owner ({}) or Sputnik DAO ({}) can invoke this method",
            self.owner_id,
            self.sputnik_dao_id
        );
    }

    fn assert_valid_tdx_measurements(m: &TdxMeasurements) {
        for (name, val) in [
            ("mrtd", &m.mrtd),
            ("rtmr0", &m.rtmr0),
            ("rtmr1", &m.rtmr1),
            ("rtmr2", &m.rtmr2),
            ("rtmr3", &m.rtmr3),
        ] {
            assert!(
                val.len() == 96
                    && val.chars().all(|c| c.is_ascii_hexdigit())
                    && val.chars().any(|c| c != '0'),
                "TDX register '{}' must be 48 non-zero bytes (96 valid hex characters)",
                name
            );
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn sample_tdx_measurements() -> TdxMeasurements {
        TdxMeasurements {
            mrtd: "a1".repeat(48),
            rtmr0: "b2".repeat(48),
            rtmr1: "c3".repeat(48),
            rtmr2: "d4".repeat(48),
            rtmr3: "e5".repeat(48),
        }
    }

    fn setup_vault() -> KratonPolicyVault {
        let context = VMContextBuilder::new()
            .predecessor_account_id("jubayir69.testnet".parse().unwrap())
            .block_timestamp(1_730_000_000_000_000_000)
            .build();
        testing_env!(context);

        KratonPolicyVault::new(
            "jubayir69.testnet".parse().unwrap(),
            "jubayir69.testnet".parse().unwrap(),
            "outlayer.testnet".parse().unwrap(),
            "worker.outlayer.testnet".parse().unwrap(),
            "v1.signer-prod.testnet".parse().unwrap(),
            50_000, // $500.00 daily limit
            15_000, // $150.00 single tx limit
            100,    // 100 bps max slippage
            sample_tdx_measurements(),
        )
    }

    #[test]
    fn test_initialization_and_poc4_gate() {
        let mut vault = setup_vault();
        assert_eq!(vault.get_agent_reputation("executor.jubayir69.testnet".parse().unwrap()), 750);

        let h_master = vault.verify_poc4_enclave_gate(
            "sig_near_ai_tee_998877".to_string(),
            "e5".repeat(48),
            "intents.near:quote-123".to_string(),
            "USDC".to_string(),
            "alice.testnet".parse().unwrap(),
            45,
            60,
        );
        assert_eq!(h_master.len(), 64);
    }

    #[test]
    #[should_panic(expected = "POC4_REPLAY_DETECTED")]
    fn test_poc4_replay_rejection() {
        let mut vault = setup_vault();
        vault.verify_poc4_enclave_gate(
            "sig_near_ai_tee_998877".to_string(),
            "e5".repeat(48),
            "intents.near:quote-123".to_string(),
            "USDC".to_string(),
            "alice.testnet".parse().unwrap(),
            45,
            60,
        );
        // Replay exact same quad-attestation
        vault.verify_poc4_enclave_gate(
            "sig_near_ai_tee_998877".to_string(),
            "e5".repeat(48),
            "intents.near:quote-123".to_string(),
            "USDC".to_string(),
            "alice.testnet".parse().unwrap(),
            45,
            60,
        );
    }

    #[test]
    fn test_mldsa65_domain_digest_verification() {
        let vault = setup_vault();
        let pubkey = vec![0x42u8; MLDSA65_PUBKEY_LEN];
        let mut hasher = Sha3_256::new();
        hasher.update(MLDSA65_DOMAIN_TAG);
        hasher.update(&pubkey);
        let expected = format!("ml-dsa-65-hash:{}", bs58::encode(hasher.finalize()).into_string());

        assert!(vault.verify_mldsa65_domain_digest(pubkey, expected));
    }

    #[test]
    fn test_reputation_slashing_on_blocked_counterparty() {
        let mut vault = setup_vault();
        let agent: AccountId = "scout.jubayir69.testnet".parse().unwrap();
        let outcome = vault.execute_or_escalate_intent(
            agent.clone(),
            "scam-drainer-vault.testnet".parse().unwrap(),
            "NEAR".to_string(),
            4_500,
            U128(10_000_000_000_000_000_000_000_000),
            "Malicious drain attempt".to_string(),
            "sig_tee".to_string(),
            "e5".repeat(48),
            "intents.near:q1".to_string(),
            30,
            40,
        );
        assert_eq!(outcome.decision, "block");
        assert_eq!(outcome.updated_reputation, 500);
    }

    #[test]
    fn test_over_limit_spend_escalates_to_sputnik_dao() {
        let mut vault = setup_vault();
        let agent: AccountId = "executor.jubayir69.testnet".parse().unwrap();
        let outcome = vault.execute_or_escalate_intent(
            agent,
            "alice.testnet".parse().unwrap(),
            "NEAR".to_string(),
            42_000, // $420.00 > $150.00 single tx cap
            U128(100_000_000_000_000_000_000_000_000),
            "Liquidity rebalance".to_string(),
            "sig_tee_valid".to_string(),
            "e5".repeat(48),
            "intents.near:q2".to_string(),
            40,
            50,
        );
        assert_eq!(outcome.tier, "SPUTNIK_DAO_PROPOSAL");
        assert_eq!(outcome.decision, "warn");
        assert!(outcome.escalated_to_dao);
    }

    #[test]
    #[should_panic(expected = "UNAUTHORIZED")]
    fn test_unauthorized_caller_rejected() {
        let mut vault = setup_vault();
        let attacker_ctx = VMContextBuilder::new()
            .predecessor_account_id("mallory-attacker.testnet".parse().unwrap())
            .block_timestamp(1_730_000_000_000_000_000)
            .build();
        testing_env!(attacker_ctx);

        vault.verify_poc4_enclave_gate(
            "sig_forged".to_string(),
            "e5".repeat(48),
            "intents.near:q-forged".to_string(),
            "USDC".to_string(),
            "mallory-attacker.testnet".parse().unwrap(),
            10,
            20,
        );
    }

    #[test]
    #[should_panic(expected = "Emergency kill switch is active")]
    fn test_emergency_kill_switch_halts_execution() {
        let mut vault = setup_vault();
        vault.set_emergency_kill_switch(true);
        vault.execute_or_escalate_intent(
            "executor.jubayir69.testnet".parse().unwrap(),
            "alice.testnet".parse().unwrap(),
            "USDC".to_string(),
            2_500,
            U128(25_000_000),
            "Normal transfer".to_string(),
            "sig_tee".to_string(),
            "e5".repeat(48),
            "intents.near:q3".to_string(),
            20,
            40,
        );
    }
}

