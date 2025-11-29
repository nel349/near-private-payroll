// Library entry point for proof-server
// Exposes core modules for testing and external use

pub mod config;
pub mod routes;
pub mod services;
pub mod state;
pub mod tee;
pub mod types;

// Re-export commonly used items
pub use services::prover;
pub use services::attestation;
