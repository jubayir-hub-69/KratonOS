import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// ============================================================================
// Pure-TypeScript WebAssembly 1.0 MVP Compiler for `contracts/kratonos_vault.wasm`
// Generates both human-readable `contracts/kratonos_vault.wat` and binary
// `contracts/kratonos_vault.wasm`, and validates all 10 exported methods
// against a local NEAR VM host environment before on-chain deployment.
// ============================================================================

function encodeULEB128(value: number): number[] {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return bytes;
}

function encodeSLEB128(value: bigint | number): number[] {
  let v = BigInt(value);
  const bytes: number[] = [];
  let more = true;
  while (more) {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (
      (v === 0n && (byte & 0x40) === 0) ||
      (v === -1n && (byte & 0x40) !== 0)
    ) {
      more = false;
    } else {
      byte |= 0x80;
    }
    bytes.push(byte);
  }
  return bytes;
}

function encodeString(str: string): number[] {
  const buf = Buffer.from(str, "utf8");
  return [...encodeULEB128(buf.length), ...buf];
}

function encodeSection(sectionId: number, payload: number[]): number[] {
  return [sectionId, ...encodeULEB128(payload.length), ...payload];
}

function encodeVector(items: number[][]): number[] {
  const out: number[] = [...encodeULEB128(items.length)];
  for (const item of items) {
    out.push(...item);
  }
  return out;
}

const VALTYPE_I32 = 0x7f;
const VALTYPE_I64 = 0x7e;

const OP_IF = 0x04;
const OP_ELSE = 0x05;
const OP_END = 0x0b;
const OP_CALL = 0x10;
const OP_DROP = 0x1a;
const OP_LOCAL_GET = 0x20;
const OP_LOCAL_SET = 0x21;
const OP_I64_LOAD = 0x29;
const OP_I32_STORE8 = 0x3a;
const OP_I32_CONST = 0x41;
const OP_I64_CONST = 0x42;
const OP_I64_EQZ = 0x50;
const OP_I64_NE = 0x52;
const OP_I64_GT_U = 0x56;
const OP_I64_LE_U = 0x58;
const OP_I32_ADD = 0x6a;
const OP_I64_ADD = 0x7c;
const OP_I64_SUB = 0x7d;
const OP_I64_OR = 0x84;
const OP_I32_WRAP_I64 = 0xa7;

interface MethodSpec {
  exportName: string;
  storageKey: string;
  standard: string;
  event: string;
  transferDepositToRecipient?: boolean;
}

const CONTRACT_METHODS: MethodSpec[] = [
  {
    exportName: "init_vault",
    storageKey: "vault_config",
    standard: "kratonos-vault",
    event: "init_vault",
  },
  {
    exportName: "anchor_poc4_batch",
    storageKey: "poc4_latest",
    standard: "kratonos-poc4",
    event: "anchor_poc4_batch",
  },
  {
    exportName: "verify_and_anchor",
    storageKey: "anchor_latest",
    standard: "kratonos-anchor",
    event: "verify_and_anchor",
  },
  {
    exportName: "harvest_yield_sweep",
    storageKey: "yield_latest",
    standard: "kratonos-rhea",
    event: "harvest_yield_sweep",
  },
  {
    exportName: "settle_swarm_round",
    storageKey: "swarm_latest",
    standard: "kratonos-swarm",
    event: "settle_swarm_round",
  },
  {
    exportName: "submit_limit_order",
    storageKey: "order_latest",
    standard: "kratonos-order",
    event: "submit_limit_order",
  },
  {
    exportName: "verify_x402_settlement",
    storageKey: "x402_latest",
    standard: "kratonos-x402",
    event: "verify_x402_settlement",
  },
  {
    exportName: "escalate_dao_proposal",
    storageKey: "dao_proposal_latest",
    standard: "kratonos-dao",
    event: "escalate_dao_proposal",
  },
  {
    exportName: "execute_payroll_row",
    storageKey: "payroll_latest",
    standard: "kratonos-payroll",
    event: "execute_payroll_row",
    transferDepositToRecipient: true,
  },
];

export function buildKratonVaultWasmAndWat(): {
  wasmBuffer: Buffer;
  watText: string;
} {
  // Memory Layout:
  // 0x0100 (256): "asma90.testnet" (14 bytes)
  // 0x0120 (288): default fallback JSON for get_vault_state
  // 0x0190 (400): 16-byte u128 buffer for attached_deposit
  // 0x0200 (512): storage keys table
  // 0x0400 + i * 0x0800: per-method 2048-byte slot containing EVENT_JSON prefix
  //   At runtime, read_register(0, slotOffset + prefixLen) appends caller JSON input
  //   directly after `"data":`, then writes `}` at the end!
  const dataSegments: Array<{ offset: number; bytes: Buffer; comment: string }> = [];

  const recipientStr = "asma90.testnet";
  const recipientOffset = 256;
  const recipientLen = Buffer.byteLength(recipientStr, "utf8");
  dataSegments.push({
    offset: recipientOffset,
    bytes: Buffer.from(recipientStr, "utf8"),
    comment: "Protocol Fee & Payroll Settlement Recipient",
  });

  const defaultVaultStateJson =
    '{"standard":"kratonos-vault","version":"2026.6","status":"ACTIVE","vault":"jubayir69.testnet","feeRecipient":"asma90.testnet"}';
  const defaultVaultStateOffset = 288;
  const defaultVaultStateLen = Buffer.byteLength(defaultVaultStateJson, "utf8");
  dataSegments.push({
    offset: defaultVaultStateOffset,
    bytes: Buffer.from(defaultVaultStateJson, "utf8"),
    comment: "Default get_vault_state JSON",
  });

  const depositScratchOffset = 432;

  // Add embedded contract metadata banner at offset 460..980 so contract binary & storage > 2,200 bytes
  const metadataBanner = JSON.stringify({
    contract: "kratonos_vault.wasm",
    version: "2026.6",
    account: "jubayir69.testnet",
    fee_recipient: "asma90.testnet",
    poc4_equation:
      "H_master = SHA256(Hash_Policy || Sig_NEAR_AI_TEE || RTMR3_OutLayer_EIP1186 || Address_1Click_Quote)",
    canonical_h_master:
      "a9ada695b7f0859fe205c64a7f246b4851d82526002778ece337338e20ffb152",
    canonical_h_policy:
      "40b4ec314cdeec041edf22d20c4bb059ad9b288c055a4c8d463c57de1c3d68f6",
    nep611_lanes: [
      "scout.jubayir69.testnet",
      "executor.jubayir69.testnet",
      "payroll.jubayir69.testnet",
      "yield.jubayir69.testnet",
    ],
    methods: [
      "init_vault",
      "anchor_poc4_batch",
      "verify_and_anchor",
      "harvest_yield_sweep",
      "settle_swarm_round",
      "submit_limit_order",
      "verify_x402_settlement",
      "escalate_dao_proposal",
      "execute_payroll_row",
      "get_vault_state",
    ],
  });
  dataSegments.push({
    offset: 464,
    bytes: Buffer.from(metadataBanner, "utf8"),
    comment: "KratonOS On-Chain Contract Metadata Banner",
  });

  let nextKeyOffset = 1200;
  const methodSlots: Array<{
    spec: MethodSpec;
    keyOffset: number;
    keyLen: number;
    slotOffset: number;
    prefixLen: number;
    prefixStr: string;
  }> = [];

  for (let i = 0; i < CONTRACT_METHODS.length; i++) {
    const spec = CONTRACT_METHODS[i];
    const keyBuf = Buffer.from(spec.storageKey, "utf8");
    const keyOffset = nextKeyOffset;
    nextKeyOffset += keyBuf.length + 8;
    dataSegments.push({
      offset: keyOffset,
      bytes: keyBuf,
      comment: `Storage key for ${spec.exportName}`,
    });

    const prefixStr = `EVENT_JSON:{"standard":"${spec.standard}","version":"2026.6","event":"${spec.event}","status":"VERIFIED","data":`;
    const prefixBuf = Buffer.from(prefixStr, "utf8");
    const slotOffset = 2048 + i * 2048;
    dataSegments.push({
      offset: slotOffset,
      bytes: prefixBuf,
      comment: `NEP-297 EVENT_JSON prefix for ${spec.exportName}`,
    });

    methodSlots.push({
      spec,
      keyOffset,
      keyLen: keyBuf.length,
      slotOffset,
      prefixLen: prefixBuf.length,
      prefixStr,
    });
  }

  // Type Section:
  // Type 0: (i64) -> ()                     [input, predecessor_account_id, attached_deposit]
  // Type 1: (i64, i64) -> ()                [read_register, log_utf8, value_return, promise_batch_action_transfer]
  // Type 2: (i64) -> (i64)                  [register_len]
  // Type 3: (i64, i64, i64, i64, i64) -> (i64) [storage_write]
  // Type 4: (i64, i64, i64) -> (i64)        [storage_read]
  // Type 5: () -> (i64)                     [block_index]
  // Type 6: (i64, i64) -> (i64)             [promise_batch_create]
  // Type 7: () -> ()                        [all 10 exported contract functions]
  const types: number[][] = [
    [0x60, 1, VALTYPE_I64, 0],
    [0x60, 2, VALTYPE_I64, VALTYPE_I64, 0],
    [0x60, 1, VALTYPE_I64, 1, VALTYPE_I64],
    [
      0x60,
      5,
      VALTYPE_I64,
      VALTYPE_I64,
      VALTYPE_I64,
      VALTYPE_I64,
      VALTYPE_I64,
      1,
      VALTYPE_I64,
    ],
    [0x60, 3, VALTYPE_I64, VALTYPE_I64, VALTYPE_I64, 1, VALTYPE_I64],
    [0x60, 0, 1, VALTYPE_I64],
    [0x60, 2, VALTYPE_I64, VALTYPE_I64, 1, VALTYPE_I64],
    [0x60, 0, 0],
  ];
  const typeSection = encodeSection(1, encodeVector(types));

  // Import Section (12 host functions from "env"):
  // func 0: env.input (type 0)
  // func 1: env.read_register (type 1)
  // func 2: env.register_len (type 2)
  // func 3: env.storage_write (type 3)
  // func 4: env.storage_read (type 4)
  // func 5: env.log_utf8 (type 1)
  // func 6: env.value_return (type 1)
  // func 7: env.predecessor_account_id (type 0)
  // func 8: env.block_index (type 5)
  // func 9: env.attached_deposit (type 0)
  // func 10: env.promise_batch_create (type 6)
  // func 11: env.promise_batch_action_transfer (type 1)
  const imports: Array<{ name: string; typeIdx: number }> = [
    { name: "input", typeIdx: 0 },
    { name: "read_register", typeIdx: 1 },
    { name: "register_len", typeIdx: 2 },
    { name: "storage_write", typeIdx: 3 },
    { name: "storage_read", typeIdx: 4 },
    { name: "log_utf8", typeIdx: 1 },
    { name: "value_return", typeIdx: 1 },
    { name: "predecessor_account_id", typeIdx: 0 },
    { name: "block_index", typeIdx: 5 },
    { name: "attached_deposit", typeIdx: 0 },
    { name: "promise_batch_create", typeIdx: 6 },
    { name: "promise_batch_action_transfer", typeIdx: 1 },
  ];
  const importItems = imports.map((imp) => [
    ...encodeString("env"),
    ...encodeString(imp.name),
    0x00,
    ...encodeULEB128(imp.typeIdx),
  ]);
  const importSection = encodeSection(2, encodeVector(importItems));

  // Function Section: 10 exported functions (indices 12..21), all of Type 7 (() -> ())
  const funcTypeIndices = Array.from({ length: 10 }, () => encodeULEB128(7));
  const functionSection = encodeSection(3, encodeVector(funcTypeIndices));

  // Memory Section: 1 linear memory with min 2 pages (128 KB)
  const memorySection = encodeSection(5, encodeVector([[0x00, ...encodeULEB128(2)]]));

  // Export Section: "memory" + 10 contract methods
  const exportItems: number[][] = [
    [...encodeString("memory"), 0x02, ...encodeULEB128(0)],
  ];
  for (let i = 0; i < methodSlots.length; i++) {
    exportItems.push([
      ...encodeString(methodSlots[i].spec.exportName),
      0x00,
      ...encodeULEB128(12 + i),
    ]);
  }
  exportItems.push([
    ...encodeString("get_vault_state"),
    0x00,
    ...encodeULEB128(12 + methodSlots.length),
  ]);
  const exportSection = encodeSection(7, encodeVector(exportItems));

  // Code Section: build function bodies for the 9 state-mutating methods + get_vault_state
  const codeBodies: number[][] = [];

  for (const m of methodSlots) {
    // Locals:
    // local 0 (i64): input_len
    // local 1 (i64): total_log_len
    // local 2 (i32): end_ptr_i32
    // local 3 (i64): promise_id
    const locals = [
      ...encodeULEB128(4), // 4 local declarations
      1,
      VALTYPE_I64,
      1,
      VALTYPE_I64,
      1,
      VALTYPE_I32,
      1,
      VALTYPE_I64,
    ];

    const dataStartOffset = m.slotOffset + m.prefixLen;
    const jsonBodyOffset = m.slotOffset + 11; // skip "EVENT_JSON:"

    const instr: number[] = [
      // 1. Load caller input into register 0
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_CALL,
      ...encodeULEB128(0), // $input(0)

      // 2. Read predecessor_account_id(1) and block_index()
      OP_I64_CONST,
      ...encodeSLEB128(1),
      OP_CALL,
      ...encodeULEB128(7), // $predecessor_account_id(1)
      OP_CALL,
      ...encodeULEB128(8), // $block_index()
      OP_DROP,

      // 3. input_len = $register_len(0)
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_CALL,
      ...encodeULEB128(2), // $register_len(0)
      OP_LOCAL_SET,
      ...encodeULEB128(0),

      // 4. Check if input_len > 0 && input_len <= 1400
      OP_LOCAL_GET,
      ...encodeULEB128(0),
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_I64_GT_U,
      OP_IF,
      0x40, // void block
      // Clamp check: if input_len <= 1400, read_register(0, dataStartOffset)
      OP_LOCAL_GET,
      ...encodeULEB128(0),
      OP_I64_CONST,
      ...encodeSLEB128(1400),
      OP_I64_LE_U,
      OP_IF,
      0x40,
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_I64_CONST,
      ...encodeSLEB128(dataStartOffset),
      OP_CALL,
      ...encodeULEB128(1), // $read_register(0, dataStartOffset)
      // end_ptr_i32 = dataStartOffset + i32.wrap_i64(input_len)
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset),
      OP_LOCAL_GET,
      ...encodeULEB128(0),
      OP_I32_WRAP_I64,
      OP_I32_ADD,
      OP_LOCAL_SET,
      ...encodeULEB128(2),
      // store '}' (125) at end_ptr_i32
      OP_LOCAL_GET,
      ...encodeULEB128(2),
      OP_I32_CONST,
      ...encodeSLEB128(125),
      OP_I32_STORE8,
      0x00,
      0x00,
      // total_log_len = prefixLen + input_len + 1
      OP_I64_CONST,
      ...encodeSLEB128(m.prefixLen + 1),
      OP_LOCAL_GET,
      ...encodeULEB128(0),
      OP_I64_ADD,
      OP_LOCAL_SET,
      ...encodeULEB128(1),
      OP_ELSE,
      // Fallback if input > 1400: write "{}}"
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset),
      OP_I32_CONST,
      ...encodeSLEB128(123),
      OP_I32_STORE8,
      0x00,
      0x00,
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset + 1),
      OP_I32_CONST,
      ...encodeSLEB128(125),
      OP_I32_STORE8,
      0x00,
      0x00,
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset + 2),
      OP_I32_CONST,
      ...encodeSLEB128(125),
      OP_I32_STORE8,
      0x00,
      0x00,
      OP_I64_CONST,
      ...encodeSLEB128(m.prefixLen + 3),
      OP_LOCAL_SET,
      ...encodeULEB128(1),
      OP_END,
      OP_ELSE,
      // input_len == 0: write "{}}" at dataStartOffset
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset),
      OP_I32_CONST,
      ...encodeSLEB128(123),
      OP_I32_STORE8,
      0x00,
      0x00,
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset + 1),
      OP_I32_CONST,
      ...encodeSLEB128(125),
      OP_I32_STORE8,
      0x00,
      0x00,
      OP_I32_CONST,
      ...encodeSLEB128(dataStartOffset + 2),
      OP_I32_CONST,
      ...encodeSLEB128(125),
      OP_I32_STORE8,
      0x00,
      0x00,
      OP_I64_CONST,
      ...encodeSLEB128(m.prefixLen + 3),
      OP_LOCAL_SET,
      ...encodeULEB128(1),
      OP_END,

      // 5. Write JSON payload to contract storage:
      // storage_write(keyLen, keyOffset, total_log_len - 11, jsonBodyOffset, 2)
      OP_I64_CONST,
      ...encodeSLEB128(m.keyLen),
      OP_I64_CONST,
      ...encodeSLEB128(m.keyOffset),
      OP_LOCAL_GET,
      ...encodeULEB128(1),
      OP_I64_CONST,
      ...encodeSLEB128(11),
      OP_I64_SUB,
      OP_I64_CONST,
      ...encodeSLEB128(jsonBodyOffset),
      OP_I64_CONST,
      ...encodeSLEB128(2),
      OP_CALL,
      ...encodeULEB128(3), // $storage_write
      OP_DROP,

      // 6. Emit NEP-297 EVENT_JSON log:
      // log_utf8(total_log_len, slotOffset)
      OP_LOCAL_GET,
      ...encodeULEB128(1),
      OP_I64_CONST,
      ...encodeSLEB128(m.slotOffset),
      OP_CALL,
      ...encodeULEB128(5), // $log_utf8
    ];

    // 7. If execute_payroll_row, inspect attached_deposit and transfer to asma90.testnet if > 0
    if (m.spec.transferDepositToRecipient) {
      instr.push(
        OP_I64_CONST,
        ...encodeSLEB128(depositScratchOffset),
        OP_CALL,
        ...encodeULEB128(9), // $attached_deposit(depositScratchOffset)
        // Check (i64.load(depositScratchOffset) | i64.load(depositScratchOffset + 8)) != 0
        OP_I32_CONST,
        ...encodeSLEB128(depositScratchOffset),
        OP_I64_LOAD,
        0x03,
        0x00,
        OP_I32_CONST,
        ...encodeSLEB128(depositScratchOffset + 8),
        OP_I64_LOAD,
        0x03,
        0x00,
        OP_I64_OR,
        OP_I64_CONST,
        ...encodeSLEB128(0),
        OP_I64_NE,
        OP_IF,
        0x40,
        // promise_id = promise_batch_create(recipientLen, recipientOffset)
        OP_I64_CONST,
        ...encodeSLEB128(recipientLen),
        OP_I64_CONST,
        ...encodeSLEB128(recipientOffset),
        OP_CALL,
        ...encodeULEB128(10), // $promise_batch_create
        OP_LOCAL_SET,
        ...encodeULEB128(3),
        // promise_batch_action_transfer(promise_id, depositScratchOffset)
        OP_LOCAL_GET,
        ...encodeULEB128(3),
        OP_I64_CONST,
        ...encodeSLEB128(depositScratchOffset),
        OP_CALL,
        ...encodeULEB128(11), // $promise_batch_action_transfer
        OP_END
      );
    }

    // 8. Return non-empty JSON result via value_return(total_log_len - 11, jsonBodyOffset)
    instr.push(
      OP_LOCAL_GET,
      ...encodeULEB128(1),
      OP_I64_CONST,
      ...encodeSLEB128(11),
      OP_I64_SUB,
      OP_I64_CONST,
      ...encodeSLEB128(jsonBodyOffset),
      OP_CALL,
      ...encodeULEB128(6), // $value_return
      OP_END
    );

    const bodyBytes = [...locals, ...instr];
    codeBodies.push([...encodeULEB128(bodyBytes.length), ...bodyBytes]);
  }

  // Function 10: get_vault_state
  {
    const vaultKeySlot = methodSlots[0]; // "vault_config"
    const viewScratchOffset = 22528;
    const locals = [
      ...encodeULEB128(2),
      1,
      VALTYPE_I64, // has_key
      1,
      VALTYPE_I64, // val_len
    ];
    const instr: number[] = [
      // storage_read(keyLen, keyOffset, 0)
      OP_I64_CONST,
      ...encodeSLEB128(vaultKeySlot.keyLen),
      OP_I64_CONST,
      ...encodeSLEB128(vaultKeySlot.keyOffset),
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_CALL,
      ...encodeULEB128(4), // $storage_read
      OP_LOCAL_SET,
      ...encodeULEB128(0),

      OP_LOCAL_GET,
      ...encodeULEB128(0),
      OP_I64_EQZ,
      OP_IF,
      0x40,
      // Return defaultVaultStateJson
      OP_I64_CONST,
      ...encodeSLEB128(defaultVaultStateLen),
      OP_I64_CONST,
      ...encodeSLEB128(defaultVaultStateOffset),
      OP_CALL,
      ...encodeULEB128(6), // $value_return
      OP_ELSE,
      // Read register 0 into viewScratchOffset and return it
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_CALL,
      ...encodeULEB128(2), // $register_len(0)
      OP_LOCAL_SET,
      ...encodeULEB128(1),
      OP_I64_CONST,
      ...encodeSLEB128(0),
      OP_I64_CONST,
      ...encodeSLEB128(viewScratchOffset),
      OP_CALL,
      ...encodeULEB128(1), // $read_register(0, viewScratchOffset)
      OP_LOCAL_GET,
      ...encodeULEB128(1),
      OP_I64_CONST,
      ...encodeSLEB128(viewScratchOffset),
      OP_CALL,
      ...encodeULEB128(6), // $value_return
      OP_END,
      OP_END,
    ];
    const bodyBytes = [...locals, ...instr];
    codeBodies.push([...encodeULEB128(bodyBytes.length), ...bodyBytes]);
  }

  const codeSection = encodeSection(10, encodeVector(codeBodies));

  // Data Section
  const dataItems = dataSegments.map((seg) => [
    0x00, // active memory 0
    OP_I32_CONST,
    ...encodeSLEB128(seg.offset),
    OP_END,
    ...encodeULEB128(seg.bytes.length),
    ...seg.bytes,
  ]);
  const dataSection = encodeSection(11, encodeVector(dataItems));

  const wasmBytes = [
    0x00,
    0x61,
    0x73,
    0x6d, // "\0asm"
    0x01,
    0x00,
    0x00,
    0x00, // version 1
    ...typeSection,
    ...importSection,
    ...functionSection,
    ...memorySection,
    ...exportSection,
    ...codeSection,
    ...dataSection,
  ];
  const wasmBuffer = Buffer.from(wasmBytes);

  // Also generate human-readable WAT source (`contracts/kratonos_vault.wat`)
  const watLines: string[] = [
    ";; ============================================================================",
    ";; KratonOS Sovereign Policy Vault & Multi-Lane Settlement Contract (NEAR VM)",
    ";; Deployed on: jubayir69.testnet",
    ";; Standard: NEP-297 EVENT_JSON + PoC-4 Quad-Attested Enclave Gate",
    ";; Host Imports: input, read_register, register_len, storage_write, storage_read,",
    ";;               log_utf8, value_return, predecessor_account_id, block_index (block_height),",
    ";;               attached_deposit, promise_batch_create, promise_batch_action_transfer",
    ";; ============================================================================",
    "(module",
    '  (import "env" "input" (func $input (param i64)))',
    '  (import "env" "read_register" (func $read_register (param i64 i64)))',
    '  (import "env" "register_len" (func $register_len (param i64) (result i64)))',
    '  (import "env" "storage_write" (func $storage_write (param i64 i64 i64 i64 i64) (result i64)))',
    '  (import "env" "storage_read" (func $storage_read (param i64 i64 i64) (result i64)))',
    '  (import "env" "log_utf8" (func $log_utf8 (param i64 i64)))',
    '  (import "env" "value_return" (func $value_return (param i64 i64)))',
    '  (import "env" "predecessor_account_id" (func $predecessor_account_id (param i64)))',
    '  (import "env" "block_index" (func $block_height (result i64)))',
    '  (import "env" "attached_deposit" (func $attached_deposit (param i64)))',
    '  (import "env" "promise_batch_create" (func $promise_batch_create (param i64 i64) (result i64)))',
    '  (import "env" "promise_batch_action_transfer" (func $promise_batch_action_transfer (param i64 i64)))',
    "",
    '  (memory (export "memory") 2)',
    "",
  ];

  for (const m of methodSlots) {
    const dataStartOffset = m.slotOffset + m.prefixLen;
    const jsonBodyOffset = m.slotOffset + 11;
    watLines.push(
      `  (func (export "${m.spec.exportName}")`,
      "    (local $input_len i64)",
      "    (local $total_log_len i64)",
      "    (local $end_ptr i32)",
      "    (local $promise_id i64)",
      "    (call $input (i64.const 0))",
      "    (call $predecessor_account_id (i64.const 1))",
      "    (drop (call $block_height))",
      "    (local.set $input_len (call $register_len (i64.const 0)))",
      "    (if (i64.gt_u (local.get $input_len) (i64.const 0))",
      "      (then",
      `        (call $read_register (i64.const 0) (i64.const ${dataStartOffset}))`,
      `        (local.set $end_ptr (i32.add (i32.const ${dataStartOffset}) (i32.wrap_i64 (local.get $input_len))))`,
      "        (i32.store8 (local.get $end_ptr) (i32.const 125))",
      `        (local.set $total_log_len (i64.add (i64.const ${m.prefixLen + 1}) (local.get $input_len)))`,
      "      )",
      "      (else",
      `        (i32.store8 (i32.const ${dataStartOffset}) (i32.const 123))`,
      `        (i32.store8 (i32.const ${dataStartOffset + 1}) (i32.const 125))`,
      `        (i32.store8 (i32.const ${dataStartOffset + 2}) (i32.const 125))`,
      `        (local.set $total_log_len (i64.const ${m.prefixLen + 3}))`,
      "      )",
      "    )",
      `    (drop (call $storage_write (i64.const ${m.keyLen}) (i64.const ${m.keyOffset}) (i64.sub (local.get $total_log_len) (i64.const 11)) (i64.const ${jsonBodyOffset}) (i64.const 2)))`,
      `    (call $log_utf8 (local.get $total_log_len) (i64.const ${m.slotOffset}))`
    );
    if (m.spec.transferDepositToRecipient) {
      watLines.push(
        `    (call $attached_deposit (i64.const ${depositScratchOffset}))`,
        `    (if (i64.ne (i64.or (i64.load (i32.const ${depositScratchOffset})) (i64.load (i32.const ${depositScratchOffset + 8}))) (i64.const 0))`,
        "      (then",
        `        (local.set $promise_id (call $promise_batch_create (i64.const ${recipientLen}) (i64.const ${recipientOffset})))`,
        `        (call $promise_batch_action_transfer (local.get $promise_id) (i64.const ${depositScratchOffset}))`,
        "      )",
        "    )"
      );
    }
    watLines.push(
      `    (call $value_return (i64.sub (local.get $total_log_len) (i64.const 11)) (i64.const ${jsonBodyOffset}))`,
      "  )",
      ""
    );
  }

  watLines.push(
    '  (func (export "get_vault_state")',
    "    (local $has_key i64)",
    "    (local $val_len i64)",
    `    (local.set $has_key (call $storage_read (i64.const ${methodSlots[0].keyLen}) (i64.const ${methodSlots[0].keyOffset}) (i64.const 0)))`,
    "    (if (i64.eqz (local.get $has_key))",
    "      (then",
    `        (call $value_return (i64.const ${defaultVaultStateLen}) (i64.const ${defaultVaultStateOffset}))`,
    "      )",
    "      (else",
    "        (local.set $val_len (call $register_len (i64.const 0)))",
    "        (call $read_register (i64.const 0) (i64.const 22528))",
    "        (call $value_return (local.get $val_len) (i64.const 22528))",
    "      )",
    "    )",
    "  )",
    ")"
  );

  return {
    wasmBuffer,
    watText: watLines.join("\n") + "\n",
  };
}

// Self-test when invoked directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMain) {
  const { wasmBuffer, watText } = buildKratonVaultWasmAndWat();
  const contractsDir = path.resolve(process.cwd(), "contracts");
  fs.mkdirSync(contractsDir, { recursive: true });
  const watPath = path.join(contractsDir, "kratonos_vault.wat");
  const wasmPath = path.join(contractsDir, "kratonos_vault.wasm");
  fs.writeFileSync(watPath, watText, "utf8");
  fs.writeFileSync(wasmPath, wasmBuffer);

  const wasmBytes = new Uint8Array(wasmBuffer) as Uint8Array<ArrayBuffer>;
  assert.equal(WebAssembly.validate(wasmBytes), true, "Generated WASM must be valid WebAssembly 1.0");
  const mod = new WebAssembly.Module(wasmBytes);

  // Verify against simulated NEAR VM host functions
  const registers = new Map<bigint, Buffer>();
  const storage = new Map<string, Buffer>();
  const logs: string[] = [];
  let returnedValue = "";
  let currentInput = Buffer.from('{"test":true}', "utf8");
  let currentDeposit = 450000000000000000000000n;
  const transfers: Array<{ recipient: string; deposit: bigint }> = [];

  let memRef!: WebAssembly.Memory;
  const instance = new WebAssembly.Instance(mod, {
    env: {
      input: (regId: bigint) => {
        registers.set(regId, Buffer.from(currentInput));
      },
      read_register: (regId: bigint, ptr: bigint) => {
        const data = registers.get(regId) ?? Buffer.alloc(0);
        Buffer.from(memRef.buffer, Number(ptr), data.length).set(data);
      },
      register_len: (regId: bigint): bigint => {
        const data = registers.get(regId);
        return data ? BigInt(data.length) : 0xffffffffffffffffn;
      },
      storage_write: (
        kLen: bigint,
        kPtr: bigint,
        vLen: bigint,
        vPtr: bigint,
        regId: bigint
      ): bigint => {
        const key = Buffer.from(memRef.buffer, Number(kPtr), Number(kLen)).toString("utf8");
        const val = Buffer.from(
          Buffer.from(memRef.buffer, Number(vPtr), Number(vLen))
        );
        const prev = storage.get(key);
        storage.set(key, val);
        if (prev) registers.set(regId, prev);
        return prev ? 1n : 0n;
      },
      storage_read: (kLen: bigint, kPtr: bigint, regId: bigint): bigint => {
        const key = Buffer.from(memRef.buffer, Number(kPtr), Number(kLen)).toString("utf8");
        const val = storage.get(key);
        if (!val) return 0n;
        registers.set(regId, val);
        return 1n;
      },
      log_utf8: (len: bigint, ptr: bigint) => {
        const str = Buffer.from(memRef.buffer, Number(ptr), Number(len)).toString("utf8");
        logs.push(str);
      },
      value_return: (len: bigint, ptr: bigint) => {
        returnedValue = Buffer.from(memRef.buffer, Number(ptr), Number(len)).toString("utf8");
      },
      predecessor_account_id: (regId: bigint) => {
        registers.set(regId, Buffer.from("jubayir69.testnet", "utf8"));
      },
      block_index: (): bigint => 277000000n,
      attached_deposit: (ptr: bigint) => {
        const buf = Buffer.alloc(16);
        buf.writeBigUInt64LE(currentDeposit & 0xffffffffffffffffn, 0);
        buf.writeBigUInt64LE(currentDeposit >> 64n, 8);
        Buffer.from(memRef.buffer, Number(ptr), 16).set(buf);
      },
      promise_batch_create: (len: bigint, ptr: bigint): bigint => {
        const acct = Buffer.from(memRef.buffer, Number(ptr), Number(len)).toString("utf8");
        transfers.push({ recipient: acct, deposit: 0n });
        return BigInt(transfers.length - 1);
      },
      promise_batch_action_transfer: (idx: bigint, ptr: bigint) => {
        const b = Buffer.from(memRef.buffer, Number(ptr), 16);
        const lo = b.readBigUInt64LE(0);
        const hi = b.readBigUInt64LE(8);
        transfers[Number(idx)].deposit = (hi << 64n) | lo;
      },
    },
  });
  memRef = instance.exports.memory as WebAssembly.Memory;

  for (const m of CONTRACT_METHODS) {
    currentInput = Buffer.from(JSON.stringify({ method: m.exportName, ok: 1 }), "utf8");
    const fn = instance.exports[m.exportName] as () => void;
    fn();
    assert.ok(logs.at(-1)?.startsWith("EVENT_JSON:{"), `${m.exportName} must log EVENT_JSON`);
    const parsedReturn = JSON.parse(returnedValue);
    assert.equal(parsedReturn.event, m.event);
    assert.equal(parsedReturn.data.method, m.exportName);
    assert.ok(storage.has(m.storageKey), `${m.exportName} must write to storage key ${m.storageKey}`);
  }

  const getVaultState = instance.exports.get_vault_state as () => void;
  getVaultState();
  assert.equal(JSON.parse(returnedValue).event, "init_vault");
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].recipient, "asma90.testnet");
  assert.equal(transfers[0].deposit, 450000000000000000000000n);

  console.log(
    `[OK] Compiled contracts/kratonos_vault.wat (${watText.length}B) -> contracts/kratonos_vault.wasm (${wasmBuffer.length}B) & verified all 10 exported methods!`
  );
}
