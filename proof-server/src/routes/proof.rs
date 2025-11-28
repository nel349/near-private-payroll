//! Proof generation and verification endpoints

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tracing::{error, info, instrument};

use crate::services::prover::ProverService;
use crate::state::AppState;
use crate::types::{
    ErrorCode, ErrorResponse, GenerateProofRequest, GenerateProofResponse, ProofResult,
    ProofType, VerifyProofResponse,
};

/// Create proof routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/proof/generate", post(generate_proof))
        .route("/proof/verify", post(verify_proof))
        .route("/attestation", get(get_attestation))
}

/// Generate a ZK proof
/// POST /api/v1/proof/generate
#[instrument(skip(state, request))]
async fn generate_proof(
    State(state): State<AppState>,
    Json(request): Json<GenerateProofRequest>,
) -> impl IntoResponse {
    info!("Received proof generation request");

    // Determine proof type and get employee ID (clone before moving request)
    let (proof_type, employee_id): (ProofType, Option<String>) = match &request {
        GenerateProofRequest::IncomeThreshold(r) => {
            (ProofType::IncomeThreshold, r.employee_id.clone())
        }
        GenerateProofRequest::IncomeRange(r) => {
            (ProofType::IncomeRange, r.employee_id.clone())
        }
        GenerateProofRequest::AverageIncome(r) => {
            (ProofType::AverageIncome, r.employee_id.clone())
        }
        GenerateProofRequest::CreditScore(r) => {
            (ProofType::CreditScore, r.employee_id.clone())
        }
        GenerateProofRequest::Payment(_) => (ProofType::Payment, None),
    };

    // Generate proof (moves request)
    let result = state.prover().generate_proof(request).await;

    match result {
        ProofResult::Success {
            receipt,
            image_id,
            journal,
            generation_time_ms,
        } => {
            // Parse public inputs from journal
            let public_inputs = match ProverService::parse_public_inputs(proof_type, &journal) {
                Ok(inputs) => inputs,
                Err(e) => {
                    error!(error = %e, "Failed to parse public inputs");
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::to_value(ErrorResponse {
                            code: ErrorCode::InternalError,
                            message: format!("Failed to parse public inputs: {e}"),
                            details: None,
                        })
                        .unwrap()),
                    );
                }
            };

            // Create attestation
            let attestation = match state.attestation_signer().create_attestation(
                proof_type,
                public_inputs.clone(),
                employee_id.as_deref(),
            ) {
                Ok(att) => att,
                Err(e) => {
                    error!(error = %e, "Failed to create attestation");
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::to_value(ErrorResponse {
                            code: ErrorCode::AttestationFailed,
                            message: format!("Failed to create attestation: {e}"),
                            details: None,
                        })
                        .unwrap()),
                    );
                }
            };

            // Increment proof counter
            state.increment_proofs();

            let response = GenerateProofResponse {
                request_id: attestation.id.clone(),
                receipt,
                image_id,
                proof_type,
                public_inputs,
                attestation,
                generation_time_ms,
            };

            info!(
                request_id = %response.request_id,
                proof_type = ?proof_type,
                generation_time_ms,
                "Proof generated successfully"
            );

            (StatusCode::OK, Json(serde_json::to_value(response).unwrap()))
        }
        ProofResult::Failure { code, message } => {
            error!(code = ?code, message = %message, "Proof generation failed");

            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::to_value(ErrorResponse {
                    code,
                    message,
                    details: None,
                })
                .unwrap()),
            )
        }
    }
}

/// Verify a ZK proof request
#[derive(Debug, serde::Deserialize)]
pub struct VerifyProofRequest {
    /// The proof to verify
    pub proof: Vec<u8>,
    /// Expected image ID
    pub image_id: [u8; 32],
    /// Proof type
    pub proof_type: ProofType,
}

/// Verify a ZK proof
/// POST /api/v1/proof/verify
#[instrument(skip(state, request))]
async fn verify_proof(
    State(state): State<AppState>,
    Json(request): Json<VerifyProofRequest>,
) -> impl IntoResponse {
    info!(proof_type = ?request.proof_type, "Received proof verification request");

    // Verify the proof
    // In dev mode, we just check the format
    // In production, this uses RISC Zero verifier

    let expected_image_id = state.prover().get_image_id(request.proof_type);

    // Check image ID matches
    if request.image_id != expected_image_id {
        return (
            StatusCode::BAD_REQUEST,
            Json(VerifyProofResponse {
                valid: false,
                public_inputs: None,
                error: Some("Image ID mismatch".to_string()),
            }),
        );
    }

    // TODO: Actual RISC Zero proof verification
    // For now, just parse the journal from the proof and return inputs

    // Mock proof structure: image_id (32) + proof_data (256) + journal (variable)
    if request.proof.len() < 288 {
        return (
            StatusCode::BAD_REQUEST,
            Json(VerifyProofResponse {
                valid: false,
                public_inputs: None,
                error: Some("Invalid proof format".to_string()),
            }),
        );
    }

    let journal = &request.proof[288..];

    match ProverService::parse_public_inputs(request.proof_type, journal) {
        Ok(inputs) => {
            info!(proof_type = ?request.proof_type, "Proof verified successfully");
            (
                StatusCode::OK,
                Json(VerifyProofResponse {
                    valid: true,
                    public_inputs: Some(inputs),
                    error: None,
                }),
            )
        }
        Err(e) => {
            error!(error = %e, "Proof verification failed");
            (
                StatusCode::BAD_REQUEST,
                Json(VerifyProofResponse {
                    valid: false,
                    public_inputs: None,
                    error: Some(format!("Failed to parse journal: {e}")),
                }),
            )
        }
    }
}

/// Get current TEE attestation
/// GET /api/v1/attestation
async fn get_attestation(State(state): State<AppState>) -> impl IntoResponse {
    match state.tee_manager() {
        Some(manager) => match manager.generate_attestation() {
            Ok(attestation) => (StatusCode::OK, Json(serde_json::to_value(attestation).unwrap())),
            Err(e) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::to_value(ErrorResponse {
                    code: ErrorCode::AttestationFailed,
                    message: format!("Failed to generate TEE attestation: {e}"),
                    details: None,
                })
                .unwrap()),
            ),
        },
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::to_value(ErrorResponse {
                code: ErrorCode::AttestationFailed,
                message: "TEE not available".to_string(),
                details: None,
            })
            .unwrap()),
        ),
    }
}
