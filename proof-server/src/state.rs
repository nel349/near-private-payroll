//! Application State
//!
//! Shared state for the proof server, accessible from all route handlers.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::services::{AttestationSigner, ProverConfig, ProverService};
use crate::tee::TeeManager;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    /// Proof generation service
    prover: ProverService,
    /// Attestation signing service
    attestation_signer: AttestationSigner,
    /// TEE manager (if available)
    tee_manager: Option<TeeManager>,
    /// Proof request queue (for rate limiting)
    proof_queue: RwLock<Vec<String>>,
    /// Total proofs generated
    total_proofs: AtomicU64,
    /// Server start time
    start_time: Instant,
}

impl AppState {
    /// Create a new application state
    pub fn new(
        prover_config: ProverConfig,
        attestation_signer: AttestationSigner,
        tee_manager: Option<TeeManager>,
    ) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                prover: ProverService::new(prover_config),
                attestation_signer,
                tee_manager,
                proof_queue: RwLock::new(Vec::new()),
                total_proofs: AtomicU64::new(0),
                start_time: Instant::now(),
            }),
        }
    }

    /// Create from environment variables
    pub fn from_env() -> Self {
        let prover = ProverService::from_env();
        let attestation_signer = AttestationSigner::from_env()
            .expect("Failed to initialize attestation signer");

        let tee_manager = TeeManager::init().ok();

        Self {
            inner: Arc::new(AppStateInner {
                prover,
                attestation_signer,
                tee_manager,
                proof_queue: RwLock::new(Vec::new()),
                total_proofs: AtomicU64::new(0),
                start_time: Instant::now(),
            }),
        }
    }

    /// Get the prover service
    pub fn prover(&self) -> &ProverService {
        &self.inner.prover
    }

    /// Get the attestation signer
    pub fn attestation_signer(&self) -> &AttestationSigner {
        &self.inner.attestation_signer
    }

    /// Get the TEE manager (if available)
    pub fn tee_manager(&self) -> Option<&TeeManager> {
        self.inner.tee_manager.as_ref()
    }

    /// Get current proof queue length
    pub async fn proof_queue_length(&self) -> usize {
        self.inner.proof_queue.read().await.len()
    }

    /// Add a proof request to the queue
    pub async fn enqueue_proof(&self, id: String) {
        self.inner.proof_queue.write().await.push(id);
    }

    /// Remove a proof request from the queue
    pub async fn dequeue_proof(&self, id: &str) {
        let mut queue = self.inner.proof_queue.write().await;
        queue.retain(|x| x != id);
    }

    /// Get total proofs generated
    pub fn total_proofs_generated(&self) -> u64 {
        self.inner.total_proofs.load(Ordering::Relaxed)
    }

    /// Increment proof counter
    pub fn increment_proofs(&self) {
        self.inner.total_proofs.fetch_add(1, Ordering::Relaxed);
    }

    /// Get server uptime in seconds
    pub fn uptime_secs(&self) -> u64 {
        self.inner.start_time.elapsed().as_secs()
    }
}
