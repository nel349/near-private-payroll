//! Server Configuration
//!
//! Handles loading configuration from environment variables and config files.

use serde::Deserialize;
use std::net::SocketAddr;
use std::path::PathBuf;

/// Server configuration
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Server bind address
    #[serde(default = "default_host")]
    pub host: String,

    /// Server port
    #[serde(default = "default_port")]
    pub port: u16,

    /// Enable development mode (mock proofs)
    #[serde(default)]
    pub dev_mode: bool,

    /// Use Bonsai API for proving
    #[serde(default)]
    pub use_bonsai: bool,

    /// Bonsai API key
    pub bonsai_api_key: Option<String>,

    /// Attestation secret key (hex encoded)
    pub attestation_secret_key: Option<String>,

    /// Require TEE for operation
    #[serde(default)]
    pub require_tee: bool,

    /// Log level
    #[serde(default = "default_log_level")]
    pub log_level: String,

    /// Enable JSON logging
    #[serde(default)]
    pub json_logs: bool,

    /// CORS allowed origins
    #[serde(default = "default_cors_origins")]
    pub cors_origins: Vec<String>,

    /// Maximum concurrent proof requests
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_proofs: usize,

    /// Path to circuit ELF binaries directory
    #[serde(default = "default_elf_dir")]
    pub elf_dir: PathBuf,
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}

fn default_port() -> u16 {
    3000
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_cors_origins() -> Vec<String> {
    vec!["*".to_string()]
}

fn default_max_concurrent() -> usize {
    10
}

fn default_elf_dir() -> PathBuf {
    // Try to resolve to absolute path from current directory
    // This way the server works regardless of where it's started from
    let relative_path = PathBuf::from("target/riscv32im-risc0-zkvm-elf/docker");

    // Check if the path exists relative to current directory
    if relative_path.exists() {
        // Convert to absolute path
        std::env::current_dir()
            .map(|cwd| cwd.join(&relative_path))
            .unwrap_or(relative_path)
    } else {
        // Try finding from workspace root by looking for Cargo.toml
        if let Ok(cwd) = std::env::current_dir() {
            let workspace_target = cwd.join("target/riscv32im-risc0-zkvm-elf/docker");
            if workspace_target.exists() {
                return workspace_target;
            }

            // Try parent directories (in case running from a subdirectory)
            let mut dir = cwd.clone();
            for _ in 0..3 {
                if let Some(parent) = dir.parent() {
                    dir = parent.to_path_buf();
                    let candidate = dir.join("target/riscv32im-risc0-zkvm-elf/docker");
                    if candidate.exists() {
                        return candidate;
                    }
                }
            }
        }

        // Fall back to relative path
        relative_path
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            dev_mode: false,
            use_bonsai: false,
            bonsai_api_key: None,
            attestation_secret_key: None,
            require_tee: false,
            log_level: default_log_level(),
            json_logs: false,
            cors_origins: default_cors_origins(),
            max_concurrent_proofs: default_max_concurrent(),
            elf_dir: default_elf_dir(),
        }
    }
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        // Load .env file if present
        let _ = dotenvy::dotenv();

        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| default_host()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or_else(default_port),
            dev_mode: std::env::var("DEV_MODE").unwrap_or_default() == "true",
            use_bonsai: std::env::var("USE_BONSAI").unwrap_or_default() == "true",
            bonsai_api_key: std::env::var("BONSAI_API_KEY").ok(),
            attestation_secret_key: std::env::var("ATTESTATION_SECRET_KEY").ok(),
            require_tee: std::env::var("REQUIRE_TEE").unwrap_or_default() == "true",
            log_level: std::env::var("LOG_LEVEL").unwrap_or_else(|_| default_log_level()),
            json_logs: std::env::var("JSON_LOGS").unwrap_or_default() == "true",
            cors_origins: std::env::var("CORS_ORIGINS")
                .map(|s| s.split(',').map(String::from).collect())
                .unwrap_or_else(|_| default_cors_origins()),
            max_concurrent_proofs: std::env::var("MAX_CONCURRENT_PROOFS")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or_else(default_max_concurrent),
            elf_dir: std::env::var("ELF_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| default_elf_dir()),
        }
    }

    /// Get socket address for binding
    pub fn socket_addr(&self) -> SocketAddr {
        format!("{}:{}", self.host, self.port)
            .parse()
            .expect("Invalid socket address")
    }
}
