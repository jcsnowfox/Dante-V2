# Ghostlight Canonical Pipeline Risk Register

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Discord behavior drift | High | Keep Discord as pass-through while adding diagnostics only. | Mitigated for this phase |
| Second Life behavior drift | High | Keep existing reply generator delegated from the canonical entrypoint. | Mitigated for this phase |
| Duplicate memory writes | High | Audit before moving writers; diagnostics marks current delegated writer path. | Open |
| Duplicate prompt injections | High | Convert builders into named contributors after snapshot parity tests exist. | Open |
| Dashboard route regressions | Medium | Add isolated `/admin/engineering/pipeline` tab only. | Mitigated for this phase |
| Trace data privacy | Medium | Store short message preview only in memory; no persistence added. | Mitigated for this phase |
