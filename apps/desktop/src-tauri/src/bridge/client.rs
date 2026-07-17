//! HTTP client for the web app's device-token Bridge endpoints.
//!
//! The Bridge never talks to Supabase directly — all DB access is server-side.
//! It authenticates with its device token (Bearer) and exchanges work over two
//! endpoints: `POST /api/bridge/poll` (claim operations + fetch current grants)
//! and `POST /api/bridge/operations/{id}` (report each outcome).

use super::model::{EventsBody, PollResponse, SubmitBody, WatchEvent};

/// The /api/bridge/events route accepts at most this many events per request.
const MAX_EVENTS_PER_REQUEST: usize = 50;

#[derive(Clone)]
pub struct BridgeClient {
    base_url: String,
    token: String,
    http: reqwest::Client,
}

impl BridgeClient {
    pub fn new(base_url: String, token: String) -> BridgeClient {
        let http = reqwest::Client::builder()
            .user_agent(concat!("CorelyxBridge/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build HTTP client");
        BridgeClient {
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
            http,
        }
    }

    pub async fn poll(&self) -> Result<PollResponse, String> {
        let url = format!("{}/api/bridge/poll", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| format!("poll request failed: {e}"))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err("device token rejected (revoked or invalid)".into());
        }
        if !resp.status().is_success() {
            return Err(format!("poll returned HTTP {}", resp.status()));
        }
        resp.json::<PollResponse>()
            .await
            .map_err(|e| format!("could not parse poll response: {e}"))
    }

    pub async fn submit(&self, operation_id: &str, body: &SubmitBody) -> Result<(), String> {
        let url = format!("{}/api/bridge/operations/{operation_id}", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("submit request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("submit returned HTTP {}", resp.status()));
        }
        Ok(())
    }

    /// Report observed filesystem changes for `file_watch` triggers. The web app
    /// re-validates each one (device ownership, event kind, name pattern, limits)
    /// before firing — the Bridge's local match is only a pre-filter. Sent in
    /// batches to respect the route's per-request cap.
    pub async fn report_events(&self, events: &[WatchEvent]) -> Result<(), String> {
        let url = format!("{}/api/bridge/events", self.base_url);
        for chunk in events.chunks(MAX_EVENTS_PER_REQUEST) {
            let body = EventsBody {
                events: chunk.to_vec(),
            };
            let resp = self
                .http
                .post(&url)
                .bearer_auth(&self.token)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("events request failed: {e}"))?;
            if !resp.status().is_success() {
                return Err(format!("events returned HTTP {}", resp.status()));
            }
        }
        Ok(())
    }
}
