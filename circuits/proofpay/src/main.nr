use dep::poseidon::poseidon2::Poseidon2;

fn hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn hash6(a: Field, b: Field, c: Field, d: Field, e: Field, f: Field) -> Field {
    Poseidon2::hash([a, b, c, d, e, f], 6)
}

fn constrain_bit(bit: Field) {
    assert(bit * (1 - bit) == 0);
}

fn compute_root(leaf: Field, path_siblings: [Field; 4], path_bits: [Field; 4]) -> Field {
    let mut cur = leaf;
    for i in 0..4 {
        let bit = path_bits[i];
        constrain_bit(bit);
        if bit == 0 {
            cur = hash2(cur, path_siblings[i]);
        } else {
            cur = hash2(path_siblings[i], cur);
        }
    }
    cur
}

pub fn main(
    root: pub Field,
    payee_hash: pub Field,
    invoice_hash: pub Field,
    min_total_cents: pub u64,
    min_paid_count: pub u32,
    period_bucket: pub u32,
    nullifier: pub Field,
    aggregate_total_cents: u64,
    paid_invoice_count: u32,
    credential_secret: Field,
    salt: Field,
    path_siblings: [Field; 4],
    path_bits: [Field; 4],
) {
    assert(aggregate_total_cents >= min_total_cents);
    assert(paid_invoice_count >= min_paid_count);

    let leaf = hash6(
        payee_hash,
        aggregate_total_cents as Field,
        paid_invoice_count as Field,
        period_bucket as Field,
        credential_secret,
        salt,
    );
    let computed_nullifier = hash2(credential_secret, invoice_hash);
    assert(computed_nullifier == nullifier);

    let computed_root = compute_root(leaf, path_siblings, path_bits);
    assert(computed_root == root);
}

