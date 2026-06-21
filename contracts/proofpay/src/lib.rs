#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec as SorobanVec,
};
use ultrahonk_soroban_verifier::PROOF_BYTES;

const PUBLIC_INPUT_BYTES: u32 = 32 * 7;

#[contract]
pub struct ProofPayContract;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootRecord {
    pub issuer: Address,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Invoice {
    pub payer: Address,
    pub payee: Address,
    pub token: Address,
    pub amount: i128,
    pub root: BytesN<32>,
    pub payee_hash: BytesN<32>,
    pub invoice_hash: BytesN<32>,
    pub min_total_cents: u128,
    pub min_paid_count: u32,
    pub period_bucket: u32,
    pub expires_at: u64,
    pub funded: bool,
    pub released: bool,
    pub cancelled: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct ParsedInputs {
    pub root: BytesN<32>,
    pub payee_hash: BytesN<32>,
    pub invoice_hash: BytesN<32>,
    pub min_total_cents: u128,
    pub min_paid_count: u32,
    pub period_bucket: u32,
    pub nullifier: BytesN<32>,
}

#[contractevent(topics = ["root"], data_format = "map")]
pub struct RootRegisteredEvent<'a> {
    #[topic]
    pub root: &'a BytesN<32>,
    pub issuer: &'a Address,
    pub expires_at: &'a u64,
}

#[contractevent(topics = ["issuer"], data_format = "map")]
pub struct IssuerAuthorizedEvent<'a> {
    #[topic]
    pub issuer: &'a Address,
    pub trusted: &'a bool,
}

#[contractevent(topics = ["invoice"], data_format = "map")]
pub struct InvoiceCreatedEvent<'a> {
    #[topic]
    pub invoice_id: &'a u64,
    pub payer: &'a Address,
    pub payee: &'a Address,
    pub amount: &'a i128,
}

#[contractevent(topics = ["funded"], data_format = "map")]
pub struct InvoiceFundedEvent<'a> {
    #[topic]
    pub invoice_id: &'a u64,
    pub amount: &'a i128,
}

#[contractevent(topics = ["released"], data_format = "map")]
pub struct InvoiceReleasedEvent<'a> {
    #[topic]
    pub invoice_id: &'a u64,
    pub payee: &'a Address,
    pub amount: &'a i128,
    pub nullifier: &'a BytesN<32>,
}

#[contractevent(topics = ["cancelled"], data_format = "map")]
pub struct InvoiceCancelledEvent<'a> {
    #[topic]
    pub invoice_id: &'a u64,
    pub amount: &'a i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Verifier,
    TrustedIssuer(Address),
    Root(BytesN<32>),
    Invoice(u64),
    NextInvoice,
    Nullifier(BytesN<32>),
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    RootExpired = 3,
    RootNotRegistered = 4,
    InvalidInvoice = 5,
    InvoiceNotFound = 6,
    InvoiceNotFunded = 7,
    InvoiceClosed = 8,
    TransferFailed = 9,
    InvalidPublicInputs = 10,
    ProofParseError = 11,
    VerificationFailed = 12,
    NullifierUsed = 13,
    PublicInputMismatch = 14,
    NotExpired = 15,
    IssuerNotTrusted = 16,
}

fn now(env: &Env) -> u64 {
    env.ledger().timestamp()
}

fn key_admin() -> DataKey {
    DataKey::Admin
}

fn key_verifier() -> DataKey {
    DataKey::Verifier
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&key_admin())
        .expect("admin must be initialized")
}

fn read_invoice(env: &Env, invoice_id: u64) -> Result<Invoice, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Invoice(invoice_id))
        .ok_or(Error::InvoiceNotFound)
}

fn write_invoice(env: &Env, invoice_id: u64, invoice: &Invoice) {
    env.storage()
        .persistent()
        .set(&DataKey::Invoice(invoice_id), invoice);
}

fn extract_32(env: &Env, buf: &[u8; PUBLIC_INPUT_BYTES as usize], index: usize) -> BytesN<32> {
    let start = index * 32;
    let mut out = [0u8; 32];
    out.copy_from_slice(&buf[start..start + 32]);
    BytesN::from_array(env, &out)
}

fn bytes32_to_u128(input: &BytesN<32>) -> u128 {
    let bytes = input.to_array();
    let mut out = 0u128;
    let mut i = 16usize;
    while i < 32 {
        out = (out << 8) | bytes[i] as u128;
        i += 1;
    }
    out
}

fn bytes32_to_u32(input: &BytesN<32>) -> u32 {
    let bytes = input.to_array();
    let mut out = 0u32;
    let mut i = 28usize;
    while i < 32 {
        out = (out << 8) | bytes[i] as u32;
        i += 1;
    }
    out
}

fn parse_public_inputs(env: &Env, public_inputs: &Bytes) -> Result<ParsedInputs, Error> {
    if public_inputs.len() != PUBLIC_INPUT_BYTES {
        return Err(Error::InvalidPublicInputs);
    }

    let mut buf = [0u8; PUBLIC_INPUT_BYTES as usize];
    public_inputs.copy_into_slice(&mut buf);

    let root = extract_32(env, &buf, 0);
    let payee_hash = extract_32(env, &buf, 1);
    let invoice_hash = extract_32(env, &buf, 2);
    let min_total = extract_32(env, &buf, 3);
    let min_count = extract_32(env, &buf, 4);
    let period = extract_32(env, &buf, 5);
    let nullifier = extract_32(env, &buf, 6);

    Ok(ParsedInputs {
        root,
        payee_hash,
        invoice_hash,
        min_total_cents: bytes32_to_u128(&min_total),
        min_paid_count: bytes32_to_u32(&min_count),
        period_bucket: bytes32_to_u32(&period),
        nullifier,
    })
}

fn verify_external(
    env: &Env,
    verifier: &Address,
    public_inputs: Bytes,
    proof_bytes: Bytes,
) -> Result<(), Error> {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(public_inputs.into_val(env));
    args.push_back(proof_bytes.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(verifier, &Symbol::new(env, "verify_proof"), args)
        .map_err(|_| Error::VerificationFailed)?
        .map_err(|_| Error::VerificationFailed)
}

#[contractimpl]
impl ProofPayContract {
    pub fn __constructor(env: Env, admin: Address, verifier: Address) -> Result<(), Error> {
        if env.storage().instance().has(&key_admin()) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&key_admin(), &admin);
        env.storage().instance().set(&key_verifier(), &verifier);
        env.storage().instance().set(&DataKey::NextInvoice, &1u64);
        Ok(())
    }

    pub fn verifier(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&key_verifier())
            .expect("verifier must be initialized")
    }

    pub fn authorize_issuer(env: Env, issuer: Address) -> Result<(), Error> {
        let admin = read_admin(&env);
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::TrustedIssuer(issuer.clone()), &true);
        IssuerAuthorizedEvent {
            issuer: &issuer,
            trusted: &true,
        }
        .publish(&env);
        Ok(())
    }

    pub fn revoke_issuer(env: Env, issuer: Address) -> Result<(), Error> {
        let admin = read_admin(&env);
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::TrustedIssuer(issuer.clone()), &false);
        IssuerAuthorizedEvent {
            issuer: &issuer,
            trusted: &false,
        }
        .publish(&env);
        Ok(())
    }

    pub fn is_issuer_trusted(env: Env, issuer: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::TrustedIssuer(issuer))
            .unwrap_or(false)
    }

    pub fn register_root(
        env: Env,
        root: BytesN<32>,
        issuer: Address,
        expires_at: u64,
    ) -> Result<(), Error> {
        issuer.require_auth();
        if !Self::is_issuer_trusted(env.clone(), issuer.clone()) {
            return Err(Error::IssuerNotTrusted);
        }
        if expires_at <= now(&env) {
            return Err(Error::RootExpired);
        }
        let record = RootRecord { issuer, expires_at };
        env.storage()
            .persistent()
            .set(&DataKey::Root(root.clone()), &record);
        RootRegisteredEvent {
            root: &root,
            issuer: &record.issuer,
            expires_at: &record.expires_at,
        }
        .publish(&env);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_invoice(
        env: Env,
        payer: Address,
        payee: Address,
        token: Address,
        amount: i128,
        root: BytesN<32>,
        payee_hash: BytesN<32>,
        invoice_hash: BytesN<32>,
        min_total_cents: u128,
        min_paid_count: u32,
        period_bucket: u32,
        expires_at: u64,
    ) -> Result<u64, Error> {
        payer.require_auth();
        if amount <= 0 || expires_at <= now(&env) {
            return Err(Error::InvalidInvoice);
        }
        let root_record: RootRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Root(root.clone()))
            .ok_or(Error::RootNotRegistered)?;
        if root_record.expires_at <= now(&env) {
            return Err(Error::RootExpired);
        }

        let invoice_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextInvoice)
            .unwrap_or(1u64);
        let invoice = Invoice {
            payer,
            payee,
            token,
            amount,
            root,
            payee_hash,
            invoice_hash,
            min_total_cents,
            min_paid_count,
            period_bucket,
            expires_at,
            funded: false,
            released: false,
            cancelled: false,
        };
        write_invoice(&env, invoice_id, &invoice);
        env.storage()
            .instance()
            .set(&DataKey::NextInvoice, &(invoice_id + 1));
        InvoiceCreatedEvent {
            invoice_id: &invoice_id,
            payer: &invoice.payer,
            payee: &invoice.payee,
            amount: &invoice.amount,
        }
        .publish(&env);
        Ok(invoice_id)
    }

    pub fn fund_invoice(env: Env, invoice_id: u64) -> Result<(), Error> {
        let mut invoice = read_invoice(&env, invoice_id)?;
        invoice.payer.require_auth();
        if invoice.funded || invoice.released || invoice.cancelled {
            return Err(Error::InvoiceClosed);
        }
        if invoice.expires_at <= now(&env) {
            return Err(Error::RootExpired);
        }

        let token_client = token::Client::new(&env, &invoice.token);
        token_client.transfer(
            &invoice.payer,
            &env.current_contract_address(),
            &invoice.amount,
        );

        invoice.funded = true;
        write_invoice(&env, invoice_id, &invoice);
        InvoiceFundedEvent {
            invoice_id: &invoice_id,
            amount: &invoice.amount,
        }
        .publish(&env);
        Ok(())
    }

    pub fn verify_and_release(
        env: Env,
        invoice_id: u64,
        public_inputs: Bytes,
        proof_bytes: Bytes,
    ) -> Result<(), Error> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(Error::ProofParseError);
        }

        let mut invoice = read_invoice(&env, invoice_id)?;
        if invoice.released || invoice.cancelled {
            return Err(Error::InvoiceClosed);
        }
        if !invoice.funded {
            return Err(Error::InvoiceNotFunded);
        }

        let parsed = parse_public_inputs(&env, &public_inputs)?;
        let nullifier = parsed.nullifier.clone();
        if parsed.root != invoice.root
            || parsed.payee_hash != invoice.payee_hash
            || parsed.invoice_hash != invoice.invoice_hash
            || parsed.min_total_cents != invoice.min_total_cents
            || parsed.min_paid_count != invoice.min_paid_count
            || parsed.period_bucket != invoice.period_bucket
        {
            return Err(Error::PublicInputMismatch);
        }

        let root_record: RootRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Root(parsed.root.clone()))
            .ok_or(Error::RootNotRegistered)?;
        if root_record.expires_at <= now(&env) {
            return Err(Error::RootExpired);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::Nullifier(parsed.nullifier.clone()))
        {
            return Err(Error::NullifierUsed);
        }

        let verifier: Address = env
            .storage()
            .instance()
            .get(&key_verifier())
            .expect("verifier must be initialized");
        verify_external(&env, &verifier, public_inputs, proof_bytes)?;

        env.storage()
            .persistent()
            .set(&DataKey::Nullifier(nullifier.clone()), &true);
        invoice.released = true;
        write_invoice(&env, invoice_id, &invoice);

        let token_client = token::Client::new(&env, &invoice.token);
        token_client.transfer(
            &env.current_contract_address(),
            &invoice.payee,
            &invoice.amount,
        );
        InvoiceReleasedEvent {
            invoice_id: &invoice_id,
            payee: &invoice.payee,
            amount: &invoice.amount,
            nullifier: &nullifier,
        }
        .publish(&env);
        Ok(())
    }

    pub fn cancel_expired(env: Env, invoice_id: u64) -> Result<(), Error> {
        let mut invoice = read_invoice(&env, invoice_id)?;
        invoice.payer.require_auth();
        if invoice.released || invoice.cancelled {
            return Err(Error::InvoiceClosed);
        }
        if invoice.expires_at > now(&env) {
            return Err(Error::NotExpired);
        }
        if invoice.funded {
            let token_client = token::Client::new(&env, &invoice.token);
            token_client.transfer(
                &env.current_contract_address(),
                &invoice.payer,
                &invoice.amount,
            );
        }
        invoice.cancelled = true;
        write_invoice(&env, invoice_id, &invoice);
        InvoiceCancelledEvent {
            invoice_id: &invoice_id,
            amount: &invoice.amount,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_invoice(env: Env, invoice_id: u64) -> Option<Invoice> {
        env.storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
    }

    pub fn get_root(env: Env, root: BytesN<32>) -> Option<RootRecord> {
        env.storage().persistent().get(&DataKey::Root(root))
    }

    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier))
    }
}

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, Ledger},
        token, Env,
    };

    #[contract]
    struct MockVerifier;

    #[contractimpl]
    impl MockVerifier {
        pub fn verify_proof(_env: Env, _public_inputs: Bytes, _proof_bytes: Bytes) {}
    }

    struct Fixture {
        env: Env,
        contract_id: Address,
        issuer: Address,
        payer: Address,
        payee: Address,
        token_id: Address,
        root: BytesN<32>,
        payee_hash: BytesN<32>,
        invoice_hash: BytesN<32>,
        nullifier: BytesN<32>,
    }

    impl Fixture {
        fn client(&self) -> ProofPayContractClient<'_> {
            ProofPayContractClient::new(&self.env, &self.contract_id)
        }
    }

    fn field_from_u128(env: &Env, value: u128) -> BytesN<32> {
        let mut out = [0u8; 32];
        let mut v = value;
        let mut i = 32usize;
        while i > 16 {
            i -= 1;
            out[i] = (v & 0xff) as u8;
            v >>= 8;
        }
        BytesN::from_array(env, &out)
    }

    fn field_from_u32(env: &Env, value: u32) -> BytesN<32> {
        field_from_u128(env, value as u128)
    }

    fn append_field(out: &mut Bytes, field: &BytesN<32>) {
        for byte in field.to_array() {
            out.push_back(byte);
        }
    }

    fn public_inputs(
        env: &Env,
        root: &BytesN<32>,
        payee_hash: &BytesN<32>,
        invoice_hash: &BytesN<32>,
        nullifier: &BytesN<32>,
    ) -> Bytes {
        let mut out = Bytes::new(env);
        append_field(&mut out, root);
        append_field(&mut out, payee_hash);
        append_field(&mut out, invoice_hash);
        append_field(&mut out, &field_from_u128(env, 100));
        append_field(&mut out, &field_from_u32(env, 3));
        append_field(&mut out, &field_from_u32(env, 202606));
        append_field(&mut out, nullifier);
        out
    }

    fn proof_bytes(env: &Env) -> Bytes {
        let mut proof = Bytes::new(env);
        for _ in 0..PROOF_BYTES {
            proof.push_back(0);
        }
        proof
    }

    fn fixture() -> Fixture {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        env.ledger().set_timestamp(100);
        env.cost_estimate().budget().reset_unlimited();

        let admin = Address::generate(&env);
        let issuer = Address::generate(&env);
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        token_admin_client.mint(&payer, &1_000);

        let verifier_id = env.register(MockVerifier, ());
        let contract_id = env.register(ProofPayContract, (admin, verifier_id));
        let root = field_from_u128(&env, 1);
        let payee_hash = field_from_u128(&env, 2);
        let invoice_hash = field_from_u128(&env, 3);
        let nullifier = field_from_u128(&env, 9);

        Fixture {
            env,
            contract_id,
            issuer,
            payer,
            payee,
            token_id,
            root,
            payee_hash,
            invoice_hash,
            nullifier,
        }
    }

    fn create_funded_invoice(f: &Fixture) -> u64 {
        let client = f.client();
        client.authorize_issuer(&f.issuer);
        client.register_root(&f.root, &f.issuer, &1_000);
        let invoice_id = client.create_invoice(
            &f.payer,
            &f.payee,
            &f.token_id,
            &250,
            &f.root,
            &f.payee_hash,
            &f.invoice_hash,
            &100,
            &3,
            &202606,
            &900,
        );
        client.fund_invoice(&invoice_id);
        invoice_id
    }

    #[test]
    fn root_registration_and_invoice_creation_work() {
        let f = fixture();
        let client = f.client();
        client.authorize_issuer(&f.issuer);
        client.register_root(&f.root, &f.issuer, &1_000);
        let record = client.get_root(&f.root).unwrap();
        assert_eq!(record.issuer, f.issuer);

        let invoice_id = client.create_invoice(
            &f.payer,
            &f.payee,
            &f.token_id,
            &250,
            &f.root,
            &f.payee_hash,
            &f.invoice_hash,
            &100,
            &3,
            &202606,
            &900,
        );
        let invoice = client.get_invoice(&invoice_id).unwrap();
        assert_eq!(invoice.amount, 250);
        assert!(!invoice.funded);
    }

    #[test]
    fn untrusted_issuer_cannot_register_root() {
        let f = fixture();
        let client = f.client();
        assert!(!client.is_issuer_trusted(&f.issuer));

        let result = client.try_register_root(&f.root, &f.issuer, &1_000);
        assert!(result.is_err() || result.unwrap().is_err());
    }

    #[test]
    fn admin_can_revoke_issuer() {
        let f = fixture();
        let client = f.client();
        client.authorize_issuer(&f.issuer);
        assert!(client.is_issuer_trusted(&f.issuer));

        client.revoke_issuer(&f.issuer);
        assert!(!client.is_issuer_trusted(&f.issuer));
    }

    #[test]
    fn proof_release_transfers_escrow_and_marks_nullifier() {
        let f = fixture();
        let invoice_id = create_funded_invoice(&f);
        let token_client = token::Client::new(&f.env, &f.token_id);
        assert_eq!(token_client.balance(&f.payee), 0);

        let inputs = public_inputs(
            &f.env,
            &f.root,
            &f.payee_hash,
            &f.invoice_hash,
            &f.nullifier,
        );
        let proof = proof_bytes(&f.env);
        let client = f.client();
        client.verify_and_release(&invoice_id, &inputs, &proof);

        assert_eq!(token_client.balance(&f.payee), 250);
        assert!(client.is_nullifier_used(&f.nullifier));
    }

    #[test]
    fn mismatched_public_inputs_reject_release() {
        let f = fixture();
        let invoice_id = create_funded_invoice(&f);
        let wrong_invoice_hash = field_from_u128(&f.env, 333);
        let inputs = public_inputs(
            &f.env,
            &f.root,
            &f.payee_hash,
            &wrong_invoice_hash,
            &f.nullifier,
        );
        let proof = proof_bytes(&f.env);
        let client = f.client();
        let result = client.try_verify_and_release(&invoice_id, &inputs, &proof);
        assert!(result.is_err() || result.unwrap().is_err());
    }

    #[test]
    fn nullifier_replay_is_rejected() {
        let f = fixture();
        let invoice_id = create_funded_invoice(&f);
        let inputs = public_inputs(
            &f.env,
            &f.root,
            &f.payee_hash,
            &f.invoice_hash,
            &f.nullifier,
        );
        let proof = proof_bytes(&f.env);
        let client = f.client();
        client.verify_and_release(&invoice_id, &inputs, &proof);

        let replay = client.try_verify_and_release(&invoice_id, &inputs, &proof);
        assert!(replay.is_err() || replay.unwrap().is_err());
    }
}
