use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use sha2::{Digest as Sha2Digest, Sha256};
use sha3::Keccak256;

/// Maximum permitted price deviation across independent oracle feeds (5.0%)
pub const MAX_PRICE_DEVIATION_PERCENT: f64 = 5.0;
/// Maximum sane token price ceiling ($1,000,000,000,000 USD) to prevent float overflow attacks
pub const MAX_SANE_PRICE_USD: f64 = 1_000_000_000_000.0;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Eip1186StorageProofNode {
    pub key: String,
    pub value: String,
    pub proof: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Eip1186ProofPayload {
    pub block_number: u64,
    pub block_hash: String,
    pub state_root: String,
    pub contract_address: String,
    pub storage_hash: String,
    pub account_proof: Vec<String>,
    pub storage_proof: Vec<Eip1186StorageProofNode>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OracleSourceSample {
    pub source_id: String,
    pub price_usd: f64,
    pub timestamp_sec: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct WasiP2EnclaveOutput {
    pub valid: bool,
    pub state_root_verified: bool,
    pub account_trie_depth: usize,
    pub storage_trie_depth: usize,
    pub median_price_usd: f64,
    pub max_deviation_percent: f64,
    pub rtmr3_measurement_hex: String, // 48-byte (96 hex chars) Intel TDX RTMR3 register
    pub rtmr3_receipt_sha256: String,  // 32-byte (64 hex chars) PoC-4 commitment
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AntiMevSlice {
    pub slice_index: usize,
    pub amount_bps: u16,
    pub delay_jitter_ms: u32,
    pub slice_commitment_hex: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct WasiP1VrfOutput {
    pub alpha: String,
    pub vrf_output_sha256: String,
    pub total_slices: usize,
    pub slices: Vec<AntiMevSlice>,
}

/// OutLayer WASI Preview 2 (`wasm32-wasip2`) Enclave Entrypoint:
/// 1. Verifies Ethereum Mainnet `eth_getProof` (EIP-1186) 2-level Merkle-Patricia Trie:
///    - Level 1 (World State Trie): `keccak256(account_proof[0]) == state_root` and parent-child hash linkage.
///    - Level 2 (Contract Storage Trie): `keccak256(storage_proof[0].proof[0]) == storage_hash` and parent-child linkage.
/// 2. Computes multi-source median price and enforces `max_deviation_percent <= 5.0%`.
/// 3. Commits execution state into a 48-byte (96 hex char) TDX `RTMR3` measurement and 32-byte receipt hash.
pub fn verify_eip1186_and_median_oracle_wasip2(
    proof: &Eip1186ProofPayload,
    oracle_samples: &[OracleSourceSample],
    max_allowed_deviation_percent: f64,
) -> Result<WasiP2EnclaveOutput, String> {
    if proof.account_proof.is_empty() {
        return Err("EIP1186_EMPTY_ACCOUNT_PROOF: accountProof array cannot be empty".to_string());
    }
    if proof.storage_proof.is_empty() || proof.storage_proof[0].proof.is_empty() {
        return Err("EIP1186_EMPTY_STORAGE_PROOF: storageProof[0].proof cannot be empty".to_string());
    }
    if proof.storage_proof[0].key.trim().is_empty()
        || proof.storage_proof[0].value.trim().is_empty()
    {
        return Err(
            "EIP1186_EMPTY_STORAGE_SLOT: storageProof[0] key and value must be non-empty"
                .to_string(),
        );
    }
    if oracle_samples.len() < 3 {
        return Err("ORACLE_INSUFFICIENT_SOURCES: At least 3 independent price sources are required".to_string());
    }
    let mut unique_sources = HashSet::with_capacity(oracle_samples.len());
    for s in oracle_samples {
        let normalized_id = s.source_id.trim().to_ascii_lowercase();
        if normalized_id.is_empty() {
            return Err("ORACLE_EMPTY_SOURCE_ID: Each oracle sample must declare a non-empty source_id".to_string());
        }
        unique_sources.insert(normalized_id);
    }
    if unique_sources.len() < 3 {
        return Err("ORACLE_DUPLICATE_SOURCES: At least 3 distinct oracle source_ids are required".to_string());
    }

    // 1. Verify World State Trie root node hash matches block header stateRoot
    let root_node_bytes = decode_hex(&proof.account_proof[0])?;
    let computed_state_root = format!("0x{}", encode_hex(&Keccak256::digest(&root_node_bytes)));
    let expected_state_root = normalize_hex_0x(&proof.state_root);

    if computed_state_root != expected_state_root {
        return Err(format!(
            "EIP1186_STATE_ROOT_MISMATCH: keccak256(accountProof[0])={} != block.stateRoot={}",
            computed_state_root, expected_state_root
        ));
    }

    // Verify parent -> child linkage across accountProof nodes
    verify_trie_hash_chain(&proof.account_proof, "accountProof")?;

    // 2. Verify Contract Storage Trie root node hash matches account storageHash
    let storage_nodes = &proof.storage_proof[0].proof;
    let storage_root_bytes = decode_hex(&storage_nodes[0])?;
    let computed_storage_hash = format!("0x{}", encode_hex(&Keccak256::digest(&storage_root_bytes)));
    let expected_storage_hash = normalize_hex_0x(&proof.storage_hash);

    if computed_storage_hash != expected_storage_hash {
        return Err(format!(
            "EIP1186_STORAGE_ROOT_MISMATCH: keccak256(storageProof[0])={} != storageHash={}",
            computed_storage_hash, expected_storage_hash
        ));
    }

    verify_trie_hash_chain(storage_nodes, "storageProof")?;

    // 3. Multi-Source Mathematical Median & Deviation Bound Check
    let mut prices: Vec<f64> = oracle_samples.iter().map(|s| s.price_usd).collect();
    for p in &prices {
        if !p.is_finite() || *p <= 0.0 || *p > MAX_SANE_PRICE_USD {
            return Err("ORACLE_INVALID_PRICE: All source prices must be finite positive numbers <= 1e12".to_string());
        }
    }
    prices.sort_by(|a, b| a.total_cmp(b));

    let mid = prices.len() / 2;
    let median_price_usd = if prices.len() % 2 == 1 {
        prices[mid]
    } else {
        prices[mid - 1] + (prices[mid] - prices[mid - 1]) / 2.0
    };

    let mut max_deviation_percent = 0.0_f64;
    for p in &prices {
        let dev = ((*p - median_price_usd).abs() / median_price_usd) * 100.0;
        if !dev.is_finite() {
            return Err("ORACLE_INVALID_DEVIATION: Computed deviation is non-finite".to_string());
        }
        if dev > max_deviation_percent {
            max_deviation_percent = dev;
        }
    }

    let limit = if max_allowed_deviation_percent.is_finite() && max_allowed_deviation_percent > 0.0 {
        max_allowed_deviation_percent.min(MAX_PRICE_DEVIATION_PERCENT)
    } else {
        MAX_PRICE_DEVIATION_PERCENT
    };

    if max_deviation_percent > limit {
        return Err(format!(
            "ORACLE_DEVIATION_EXCEEDED: Max deviation {:.4}% exceeds allowed {:.2}%",
            max_deviation_percent, limit
        ));
    }

    // 4. Derive deterministic 48-byte (96 hex chars) Intel TDX RTMR3 measurement & 32-byte receipt
    let normalized_contract = normalize_hex_0x(&proof.contract_address);
    let normalized_block_hash = normalize_hex_0x(&proof.block_hash);
    let normalized_slot_key = normalize_hex_0x(&proof.storage_proof[0].key);
    let normalized_slot_val = normalize_hex_0x(&proof.storage_proof[0].value);
    let binding_preimage = format!(
        "outlayer:wasip2:v1|block:{}|block_hash:{}|contract:{}|state_root:{}|storage_hash:{}|slot:{}={}|median:{:.4}|dev:{:.4}",
        proof.block_number,
        normalized_block_hash,
        normalized_contract,
        expected_state_root,
        expected_storage_hash,
        normalized_slot_key,
        normalized_slot_val,
        median_price_usd,
        max_deviation_percent
    );

    let hash_part_1 = Sha256::digest(binding_preimage.as_bytes());
    let hash_part_2 = Sha256::digest(format!("{}|rtmr3-ext", binding_preimage).as_bytes());

    let mut rtmr3_bytes = Vec::with_capacity(48);
    rtmr3_bytes.extend_from_slice(&hash_part_1[..32]);
    rtmr3_bytes.extend_from_slice(&hash_part_2[..16]);

    let rtmr3_measurement_hex = encode_hex(&rtmr3_bytes);
    let rtmr3_receipt_sha256 = encode_hex(&hash_part_1);

    Ok(WasiP2EnclaveOutput {
        valid: true,
        state_root_verified: true,
        account_trie_depth: proof.account_proof.len(),
        storage_trie_depth: storage_nodes.len(),
        median_price_usd,
        max_deviation_percent,
        rtmr3_measurement_hex,
        rtmr3_receipt_sha256,
    })
}

/// OutLayer WASI Preview 1 (`wasm32-wasip1`) VRF Anti-MEV Slicer:
/// Given `request_id`, `sender_id`, `seed`, and the 64-byte Ed25519 VRF signature over
/// `alpha = format!("vrf:{}:{}:{}", request_id, sender_id, seed)`, computes `SHA256(signature)`
/// and deterministically partitions an order into anti-MEV basis-point slices (summing to 10,000 bps)
/// with randomized execution time jitter (`150ms .. 2400ms`).
pub fn compute_vrf_anti_mev_slices_wasip1(
    request_id: u64,
    sender_id: &str,
    seed: &str,
    ed25519_signature: &[u8],
    slice_count: usize,
) -> Result<WasiP1VrfOutput, String> {
    if ed25519_signature.len() != 64 {
        return Err(format!(
            "VRF_INVALID_SIGNATURE_LEN: Expected 64-byte Ed25519 signature, got {}",
            ed25519_signature.len()
        ));
    }
    if sender_id.trim().is_empty() || seed.trim().is_empty() {
        return Err("VRF_INVALID_INPUT: sender_id and seed must be non-empty".to_string());
    }
    let count = slice_count.clamp(2, 8);
    let alpha = format!("vrf:{}:{}:{}", request_id, sender_id, seed);
    let vrf_digest = Sha256::digest(ed25519_signature);
    let vrf_output_sha256 = encode_hex(&vrf_digest);

    let mut raw_weights = Vec::with_capacity(count);
    let mut weight_sum: u32 = 0;
    for i in 0..count {
        let w = u32::from(vrf_digest[i % 32]) + 64; // strictly positive weight
        raw_weights.push(w);
        weight_sum = weight_sum
            .checked_add(w)
            .ok_or_else(|| "VRF_WEIGHT_OVERFLOW: Slice weight sum overflowed".to_string())?;
    }

    let mut allocated_bps: u16 = 0;
    let mut slices = Vec::with_capacity(count);

    for i in 0..count {
        let amount_bps = if i + 1 == count {
            10_000u16.saturating_sub(allocated_bps)
        } else {
            let share = ((raw_weights[i] as u64 * 10_000) / weight_sum as u64) as u16;
            allocated_bps = allocated_bps
                .checked_add(share)
                .ok_or_else(|| "VRF_BPS_OVERFLOW: Allocated bps overflowed".to_string())?;
            share
        };

        let jitter_seed = u16::from_be_bytes([
            vrf_digest[(i * 2) % 32],
            vrf_digest[(i * 2 + 1) % 32],
        ]);
        let delay_jitter_ms = 150 + (u32::from(jitter_seed) % 2250);

        let slice_commit = Sha256::digest(
            format!("{}|slice:{}|bps:{}|jitter:{}", vrf_output_sha256, i, amount_bps, delay_jitter_ms)
                .as_bytes(),
        );

        slices.push(AntiMevSlice {
            slice_index: i,
            amount_bps,
            delay_jitter_ms,
            slice_commitment_hex: encode_hex(&slice_commit),
        });
    }

    Ok(WasiP1VrfOutput {
        alpha,
        vrf_output_sha256,
        total_slices: count,
        slices,
    })
}

fn verify_trie_hash_chain(nodes: &[String], label: &str) -> Result<(), String> {
    for i in 1..nodes.len() {
        let child_bytes = decode_hex(&nodes[i])?;
        let parent_hex = strip_0x_prefix(&nodes[i - 1]).to_ascii_lowercase();
        // In Ethereum Merkle-Patricia Tries, RLP nodes >= 32 bytes are referenced by their 32-byte Keccak-256 hash;
        // nodes < 32 bytes are embedded inline inside the parent RLP list.
        if child_bytes.len() >= 32 {
            let child_hash_hex = encode_hex(&Keccak256::digest(&child_bytes));
            if !parent_hex.contains(&child_hash_hex) {
                return Err(format!(
                    "EIP1186_TRIE_LINK_BROKEN: {}[{}] keccak256 ({}) not embedded in parent node {}[{}]",
                    label,
                    i,
                    child_hash_hex,
                    label,
                    i - 1
                ));
            }
        } else {
            let inline_child_hex = encode_hex(&child_bytes);
            if !parent_hex.contains(&inline_child_hex) {
                return Err(format!(
                    "EIP1186_INLINE_TRIE_LINK_BROKEN: {}[{}] inline RLP ({}) not embedded in parent node {}[{}]",
                    label,
                    i,
                    inline_child_hex,
                    label,
                    i - 1
                ));
            }
        }
    }
    Ok(())
}

fn strip_0x_prefix(input: &str) -> &str {
    let trimmed = input.trim();
    trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
        .unwrap_or(trimmed)
}

fn normalize_hex_0x(input: &str) -> String {
    format!("0x{}", strip_0x_prefix(input).to_ascii_lowercase())
}

fn decode_hex(input: &str) -> Result<Vec<u8>, String> {
    let cleaned = strip_0x_prefix(input);
    if cleaned.is_empty() {
        return Err("Empty hex string".to_string());
    }
    if cleaned.len() % 2 != 0 {
        return Err("Odd-length hex string".to_string());
    }
    let mut out = Vec::with_capacity(cleaned.len() / 2);
    for i in (0..cleaned.len()).step_by(2) {
        let byte = u8::from_str_radix(&cleaned[i..i + 2], 16)
            .map_err(|e| format!("Invalid hex byte: {}", e))?;
        out.push(byte);
    }
    Ok(out)
}

fn encode_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasip1_vrf_slicing_sums_to_10000_bps() {
        let sig = [0x5au8; 64];
        let out = compute_vrf_anti_mev_slices_wasip1(
            1001,
            "jubayir69.testnet",
            "eth-usdc-limit-order",
            &sig,
            4,
        )
        .unwrap();
        let total_bps: u16 = out.slices.iter().map(|s| s.amount_bps).sum();
        assert_eq!(total_bps, 10_000);
        assert_eq!(out.slices.len(), 4);
    }

    #[test]
    fn test_wasip2_eip1186_and_median_oracle_verification() {
        let acct_root = vec![0xaa_u8; 40];
        let stor_root = vec![0xbb_u8; 40];
        let state_root = format!("0x{}", encode_hex(&Keccak256::digest(&acct_root)));
        let storage_hash = format!("0x{}", encode_hex(&Keccak256::digest(&stor_root)));

        let proof = Eip1186ProofPayload {
            block_number: 22_100_000,
            block_hash: format!("0x{}", "11".repeat(32)),
            state_root,
            contract_address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419".to_string(),
            storage_hash,
            account_proof: vec![format!("0x{}", encode_hex(&acct_root))],
            storage_proof: vec![Eip1186StorageProofNode {
                key: "0x0".to_string(),
                value: "0x01".to_string(),
                proof: vec![format!("0x{}", encode_hex(&stor_root))],
            }],
        };

        let samples = vec![
            OracleSourceSample {
                source_id: "chainlink".to_string(),
                price_usd: 2250.0,
                timestamp_sec: 1_730_000_000,
            },
            OracleSourceSample {
                source_id: "coinbase".to_string(),
                price_usd: 2252.5,
                timestamp_sec: 1_730_000_001,
            },
            OracleSourceSample {
                source_id: "kraken".to_string(),
                price_usd: 2248.0,
                timestamp_sec: 1_730_000_002,
            },
        ];

        let out = verify_eip1186_and_median_oracle_wasip2(&proof, &samples, 5.0).unwrap();
        assert!(out.valid);
        assert_eq!(out.median_price_usd, 2250.0);
        assert_eq!(out.rtmr3_measurement_hex.len(), 96);
    }
}

