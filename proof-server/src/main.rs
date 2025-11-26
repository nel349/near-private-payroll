//! # NEAR Private Payroll - Proof Server
//!
//! ZK proof generation server with TEE support for privacy-preserving payroll.
//!
//! ## Features
//!
//! - Generate RISC Zero ZK proofs for income, payment, and credit score verification
//! - Server attestation with Ed25519 signatures
//! - TEE support (Intel SGX, TDX, AMD SEV) for hardware-based privacy
//! - REST API for proof generation and verification
//!
//! ## Usage
//!
//! ```bash
//! # Development mode (mock proofs)
//! DEV_MODE=true cargo run
//!
//! # Production with local proving
//! cargo run
//!
//! # Production with Bonsai API
//! USE_BONSAI=true BONSAI_API_KEY=xxx cargo run
//!
//! # With TEE support
//! cargo run --features tee
//! ```
//!
//! ## API Endpoints
//!
//! - `GET /health` - Health check
//! - `GET /status` - Detailed server status
//! - `POST /api/v1/proof/generate` - Generate a ZK proof
//! - `POST /api/v1/proof/verify` - Verify a ZK proof
//! - `GET /api/v1/attestation` - Get current TEE attestation

mod config;
mod routes;
mod services;
mod state;
mod tee;
mod types;

use axum::http::{header, Method};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use config::Config;
use routes::create_routes;
use services::{AttestationSigner, ProverConfig};
use state::AppState;
use tee::TeeManager;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load configuration
    let config = Config::from_env();

    // Initialize logging
    init_logging(&config);

    info!(
        version = env!("CARGO_PKG_VERSION"),
        dev_mode = config.dev_mode,
        use_bonsai = config.use_bonsai,
        require_tee = config.require_tee,
        "Starting NEAR Private Payroll Proof Server"
    );

    // Initialize TEE manager
    let tee_manager = match TeeManager::init() {
        Ok(manager) => {
            if manager.is_available() {
                info!(
                    tee_type = %manager.tee_type().as_str(),
                    "TEE support enabled"
                );
            } else {
                info!("TEE not available, running in software mode");
            }
            Some(manager)
        }
        Err(e) => {
            if config.require_tee {
                anyhow::bail!("TEE required but initialization failed: {e}");
            }
            info!("TEE initialization skipped: {e}");
            None
        }
    };

    // Initialize attestation signer
    let attestation_signer = AttestationSigner::from_env()?;
    info!(
        pubkey = %hex::encode(attestation_signer.public_key()),
        "Attestation signer initialized"
    );

    // Initialize prover
    let prover_config = ProverConfig {
        use_bonsai: config.use_bonsai,
        bonsai_api_key: config.bonsai_api_key.clone(),
        dev_mode: config.dev_mode,
        elf_dir: config.elf_dir.clone(),
    };

    if config.dev_mode {
        info!("Running in DEVELOPMENT mode - proofs are MOCKED");
    }

    // Create application state
    let state = AppState::new(prover_config, attestation_signer, tee_manager);

    // Build CORS layer
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_origin(Any);

    // Build router
    let app = create_routes(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start server
    let addr = config.socket_addr();
    info!(%addr, "Server listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Initialize logging based on configuration
fn init_logging(config: &Config) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.log_level));

    if config.json_logs {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt::layer().json())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(
                fmt::layer()
                    .with_target(true)
                    .with_level(true)
                    .with_ansi(true),
            )
            .init();
    }
}
