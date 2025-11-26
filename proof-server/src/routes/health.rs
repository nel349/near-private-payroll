//! Health and status endpoints

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};

use crate::state::AppState;
use crate::types::{HealthResponse, ProofType, StatusResponse};

/// Create health routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/status", get(status))
}

/// Health check endpoint
/// GET /health
async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let queue_length = state.proof_queue_length().await;
    let estimated_wait = queue_length as u64 * 30; // ~30 seconds per proof estimate

    let tee_manager = state.tee_manager();
    let tee_available = tee_manager.map(|m| m.is_available()).unwrap_or(false);
    let tee_type = tee_manager
        .filter(|m| m.is_available())
        .map(|m| m.tee_type().as_str().to_string());

    let response = HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        queue_length,
        estimated_wait_secs: estimated_wait,
        tee_available,
        tee_type,
    };

    (StatusCode::OK, Json(response))
}

/// Detailed status endpoint
/// GET /status
async fn status(State(state): State<AppState>) -> impl IntoResponse {
    let tee_manager = state.tee_manager();
    let tee_attestation = tee_manager
        .and_then(|m| m.generate_attestation().ok());

    let response = StatusResponse {
        status: "running".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        supported_proof_types: vec![
            ProofType::IncomeThreshold,
            ProofType::IncomeRange,
            ProofType::AverageIncome,
            ProofType::CreditScore,
            ProofType::Payment,
        ],
        server_pubkey: state.attestation_signer().public_key(),
        tee_attestation,
        total_proofs: state.total_proofs_generated(),
        uptime_secs: state.uptime_secs(),
    };

    (StatusCode::OK, Json(response))
}
