# Runbook: Ollama Proxy Port Collision

> Status: SPEC-008 T218 (FR-260b, FR-090l)

---

## 1. Symptom

- The Ollama proxy fails to bind because another process holds the
  configured port.
- Aegis local-mode fallback (FR-362) returns `lm_studio_unhealthy`.

## 2. Impact

- Aegis fallback chain falls through to `defer:deferred_no_fallback`.

## 3. Diagnose

1. `lsof -nP -iTCP:<port> -sTCP:LISTEN` to find the holder.
2. Check the proxy systemd unit logs.

## 4. Mitigate

- Stop the conflicting service or move the proxy to a free port via
  `OLLAMA_PROXY_PORT`.

## 5. Recover

- Restart the proxy: `systemctl --user restart ollama-proxy`.

## 6. Validate

- `lm_studio_health.state='healthy'`.
- Aegis local-mode fallback succeeds on the next review tick.

## 7. Postmortem

- Update the deployment doc if the port was misconfigured.
