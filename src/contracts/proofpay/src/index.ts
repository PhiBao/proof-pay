import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"Unauthorized"},
  3: {message:"RootExpired"},
  4: {message:"RootNotRegistered"},
  5: {message:"InvalidInvoice"},
  6: {message:"InvoiceNotFound"},
  7: {message:"InvoiceNotFunded"},
  8: {message:"InvoiceClosed"},
  9: {message:"TransferFailed"},
  10: {message:"InvalidPublicInputs"},
  11: {message:"ProofParseError"},
  12: {message:"VerificationFailed"},
  13: {message:"NullifierUsed"},
  14: {message:"PublicInputMismatch"},
  15: {message:"NotExpired"},
  16: {message:"IssuerNotTrusted"}
}


export interface Invoice {
  amount: i128;
  cancelled: boolean;
  expires_at: u64;
  funded: boolean;
  invoice_hash: Buffer;
  min_paid_count: u32;
  min_total_cents: u128;
  payee: string;
  payee_hash: Buffer;
  payer: string;
  period_bucket: u32;
  released: boolean;
  root: Buffer;
  token: string;
}


export interface RootRecord {
  expires_at: u64;
  issuer: string;
}


export interface ParsedInputs {
  invoice_hash: Buffer;
  min_paid_count: u32;
  min_total_cents: u128;
  nullifier: Buffer;
  payee_hash: Buffer;
  period_bucket: u32;
  root: Buffer;
}







export interface Client {
  /**
   * Construct and simulate a get_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_root: ({root}: {root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<RootRecord>>>

  /**
   * Construct and simulate a verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verifier: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_invoice: ({invoice_id}: {invoice_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Invoice>>>

  /**
   * Construct and simulate a fund_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fund_invoice: ({invoice_id}: {invoice_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a register_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_root: ({root, issuer, expires_at}: {root: Buffer, issuer: string, expires_at: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke_issuer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_issuer: ({issuer}: {issuer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cancel_expired transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_expired: ({invoice_id}: {invoice_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_invoice: ({payer, payee, token, amount, root, payee_hash, invoice_hash, min_total_cents, min_paid_count, period_bucket, expires_at}: {payer: string, payee: string, token: string, amount: i128, root: Buffer, payee_hash: Buffer, invoice_hash: Buffer, min_total_cents: u128, min_paid_count: u32, period_bucket: u32, expires_at: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a authorize_issuer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  authorize_issuer: ({issuer}: {issuer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_issuer_trusted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_issuer_trusted: ({issuer}: {issuer: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_nullifier_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nullifier_used: ({nullifier}: {nullifier: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a verify_and_release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_and_release: ({invoice_id, public_inputs, proof_bytes}: {invoice_id: u64, public_inputs: Buffer, proof_bytes: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, verifier}: {admin: string, verifier: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, verifier}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAACAAAAAAAAAAtSb290RXhwaXJlZAAAAAADAAAAAAAAABFSb290Tm90UmVnaXN0ZXJlZAAAAAAAAAQAAAAAAAAADkludmFsaWRJbnZvaWNlAAAAAAAFAAAAAAAAAA9JbnZvaWNlTm90Rm91bmQAAAAABgAAAAAAAAAQSW52b2ljZU5vdEZ1bmRlZAAAAAcAAAAAAAAADUludm9pY2VDbG9zZWQAAAAAAAAIAAAAAAAAAA5UcmFuc2ZlckZhaWxlZAAAAAAACQAAAAAAAAATSW52YWxpZFB1YmxpY0lucHV0cwAAAAAKAAAAAAAAAA9Qcm9vZlBhcnNlRXJyb3IAAAAACwAAAAAAAAASVmVyaWZpY2F0aW9uRmFpbGVkAAAAAAAMAAAAAAAAAA1OdWxsaWZpZXJVc2VkAAAAAAAADQAAAAAAAAATUHVibGljSW5wdXRNaXNtYXRjaAAAAAAOAAAAAAAAAApOb3RFeHBpcmVkAAAAAAAPAAAAAAAAABBJc3N1ZXJOb3RUcnVzdGVkAAAAEA==",
        "AAAAAQAAAAAAAAAAAAAAB0ludm9pY2UAAAAADgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAljYW5jZWxsZWQAAAAAAAABAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAZmdW5kZWQAAAAAAAEAAAAAAAAADGludm9pY2VfaGFzaAAAA+4AAAAgAAAAAAAAAA5taW5fcGFpZF9jb3VudAAAAAAABAAAAAAAAAAPbWluX3RvdGFsX2NlbnRzAAAAAAoAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAKcGF5ZWVfaGFzaAAAAAAD7gAAACAAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAANcGVyaW9kX2J1Y2tldAAAAAAAAAQAAAAAAAAACHJlbGVhc2VkAAAAAQAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAAClJvb3RSZWNvcmQAAAAAAAIAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAABmlzc3VlcgAAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAADFBhcnNlZElucHV0cwAAAAcAAAAAAAAADGludm9pY2VfaGFzaAAAA+4AAAAgAAAAAAAAAA5taW5fcGFpZF9jb3VudAAAAAAABAAAAAAAAAAPbWluX3RvdGFsX2NlbnRzAAAAAAoAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAApwYXllZV9oYXNoAAAAAAPuAAAAIAAAAAAAAAANcGVyaW9kX2J1Y2tldAAAAAAAAAQAAAAAAAAABHJvb3QAAAPuAAAAIA==",
        "AAAABQAAAAAAAAAAAAAAEkludm9pY2VGdW5kZWRFdmVudAAAAAAAAQAAAAZmdW5kZWQAAAAAAAIAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAE0ludm9pY2VDcmVhdGVkRXZlbnQAAAAAAQAAAAdpbnZvaWNlAAAAAAQAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAABAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAAAAAAAAVwYXllZQAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAE1Jvb3RSZWdpc3RlcmVkRXZlbnQAAAAAAQAAAARyb290AAAAAwAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAQAAAAAAAAAGaXNzdWVyAAAAAAATAAAAAAAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAFEludm9pY2VSZWxlYXNlZEV2ZW50AAAAAQAAAAhyZWxlYXNlZAAAAAQAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAABAAAAAAAAAAVwYXllZQAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAludWxsaWZpZXIAAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAFUludm9pY2VDYW5jZWxsZWRFdmVudAAAAAAAAAEAAAAJY2FuY2VsbGVkAAAAAAAAAgAAAAAAAAAKaW52b2ljZV9pZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAFUlzc3VlckF1dGhvcml6ZWRFdmVudAAAAAAAAAEAAAAGaXNzdWVyAAAAAAACAAAAAAAAAAZpc3N1ZXIAAAAAABMAAAABAAAAAAAAAAd0cnVzdGVkAAAAAAEAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAIZ2V0X3Jvb3QAAAABAAAAAAAAAARyb290AAAD7gAAACAAAAABAAAD6AAAB9AAAAAKUm9vdFJlY29yZAAA",
        "AAAAAAAAAAAAAAAIdmVyaWZpZXIAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAALZ2V0X2ludm9pY2UAAAAAAQAAAAAAAAAKaW52b2ljZV9pZAAAAAAABgAAAAEAAAPoAAAH0AAAAAdJbnZvaWNlAA==",
        "AAAAAAAAAAAAAAAMZnVuZF9pbnZvaWNlAAAAAQAAAAAAAAAKaW52b2ljZV9pZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAANcmVnaXN0ZXJfcm9vdAAAAAAAAAMAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAGaXNzdWVyAAAAAAATAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAANcmV2b2tlX2lzc3VlcgAAAAAAAAEAAAAAAAAABmlzc3VlcgAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAOY2FuY2VsX2V4cGlyZWQAAAAAAAEAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAOY3JlYXRlX2ludm9pY2UAAAAAAAsAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAFcGF5ZWUAAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAAAAAApwYXllZV9oYXNoAAAAAAPuAAAAIAAAAAAAAAAMaW52b2ljZV9oYXNoAAAD7gAAACAAAAAAAAAAD21pbl90b3RhbF9jZW50cwAAAAAKAAAAAAAAAA5taW5fcGFpZF9jb3VudAAAAAAABAAAAAAAAAANcGVyaW9kX2J1Y2tldAAAAAAAAAQAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAABAAAD6QAAAAYAAAAD",
        "AAAAAAAAAAAAAAAQYXV0aG9yaXplX2lzc3VlcgAAAAEAAAAAAAAABmlzc3VlcgAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAARaXNfaXNzdWVyX3RydXN0ZWQAAAAAAAABAAAAAAAAAAZpc3N1ZXIAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAARaXNfbnVsbGlmaWVyX3VzZWQAAAAAAAABAAAAAAAAAAludWxsaWZpZXIAAAAAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAAAAAAAASdmVyaWZ5X2FuZF9yZWxlYXNlAAAAAAADAAAAAAAAAAppbnZvaWNlX2lkAAAAAAAGAAAAAAAAAA1wdWJsaWNfaW5wdXRzAAAAAAAADgAAAAAAAAALcHJvb2ZfYnl0ZXMAAAAADgAAAAEAAAPpAAAAAgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_root: this.txFromJSON<Option<RootRecord>>,
        verifier: this.txFromJSON<string>,
        get_invoice: this.txFromJSON<Option<Invoice>>,
        fund_invoice: this.txFromJSON<Result<void>>,
        register_root: this.txFromJSON<Result<void>>,
        revoke_issuer: this.txFromJSON<Result<void>>,
        cancel_expired: this.txFromJSON<Result<void>>,
        create_invoice: this.txFromJSON<Result<u64>>,
        authorize_issuer: this.txFromJSON<Result<void>>,
        is_issuer_trusted: this.txFromJSON<boolean>,
        is_nullifier_used: this.txFromJSON<boolean>,
        verify_and_release: this.txFromJSON<Result<void>>
  }
}