//! HTTP Routes for the Proof Server
//!
//! Provides REST API endpoints for proof generation and verification.

pub mod health;
pub mod proof;

use axum::Router;

use crate::state::AppState;

/// Create all routes
pub fn create_routes(state: AppState) -> Router {
    Router::new()
        .merge(health::routes())
        .nest("/api/v1", proof::routes())
        .with_state(state)
}
