//! Services for the Proof Server
//!
//! Contains the core business logic for proof generation and attestation.

pub mod attestation;
pub mod prover;

pub use attestation::AttestationSigner;
pub use prover::{ProverConfig, ProverService};
