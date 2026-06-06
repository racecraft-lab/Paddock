# Runbook: Ollama Host Port Collision

> Status: SPEC-008 T218 (FR-260b, FR-090l)

---

## 1. Symptom

- Ollama fails to bind because another process holds the configured
  host/port.
- Ollama log ingest reports the configured host while no Ollama daemon
  is listening there.

## 2. Impact

- Ollama-derived usage reconciliation is stale until the daemon is
  reachable and writing logs again.

## 3. Diagnose

1. `lsof -nP -iTCP:<port> -sTCP:LISTEN` to find the holder.
2. Check the Ollama daemon logs.

## 4. Mitigate

- Stop the conflicting service or move Ollama to a free host/port via
  `OLLAMA_HOST`.

## 5. Recover

- Restart the Ollama daemon, then restart Paddock if `OLLAMA_HOST`
  changed in the service environment.

## 6. Validate

- `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows the Ollama daemon on the
  expected port.
- The `ollama_log` source resumes processing `~/.ollama/logs/server.log`.

## 7. Postmortem

- Update the deployment doc if the port was misconfigured.
