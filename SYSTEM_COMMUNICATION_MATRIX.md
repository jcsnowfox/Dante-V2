# System Communication Matrix

Legend: connected, partially connected, one-way only, config exists but unused, stub only, not connected, unknown.

| From / To | Discord | Dashboard | Second Life | Telegram | Memory | Journals | Dreams | Schedules | Image | Audio | Emotional | Presence/world | User profile | Identity | Diagnostics | Storage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Discord | connected | partially connected | partially connected | not connected | connected | partially connected | partially connected | partially connected | connected | connected | connected | connected | connected | connected | connected | connected |
| Dashboard | partially connected | connected | connected | not connected | connected | connected | partially connected | connected | connected | connected | connected | connected | partially connected | partially connected | connected | connected |
| Second Life | partially connected | connected | connected | not connected | partially connected | connected | unknown | partially connected | partially connected | unknown | partially connected | connected | partially connected | connected | partially connected | connected |
| Telegram | not connected | not connected | not connected | stub only | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | stub only | unknown | unknown |
| Memory | connected | connected | partially connected | unknown | connected | partially connected | partially connected | partially connected | partially connected | partially connected | connected | connected | connected | connected | partially connected | connected |
| Journals | partially connected | connected | connected | unknown | partially connected | connected | partially connected | partially connected | not connected | not connected | partially connected | partially connected | unknown | partially connected | partially connected | connected |
| Dreams | partially connected | partially connected | unknown | unknown | partially connected | partially connected | connected | partially connected | not connected | not connected | partially connected | partially connected | unknown | connected | unknown | connected |
| Schedules | partially connected | connected | partially connected | unknown | partially connected | partially connected | partially connected | connected | partially connected | partially connected | partially connected | connected | unknown | connected | partially connected | connected |
| Image | connected | connected | partially connected | unknown | partially connected | not connected | not connected | partially connected | connected | not connected | unknown | unknown | unknown | connected | partially connected | connected |
| Audio | connected | connected | unknown | unknown | partially connected | not connected | not connected | partially connected | not connected | connected | unknown | unknown | unknown | connected | partially connected | connected |
| Emotional | connected | connected | partially connected | unknown | connected | partially connected | partially connected | partially connected | unknown | unknown | connected | partially connected | unknown | connected | partially connected | connected |
| Presence/world | connected | connected | connected | unknown | connected | partially connected | partially connected | connected | unknown | unknown | partially connected | connected | partially connected | connected | partially connected | connected |
| User profile | connected | partially connected | partially connected | unknown | connected | unknown | unknown | unknown | unknown | unknown | unknown | partially connected | connected | partially connected | partially connected | connected |
| Identity | connected | partially connected | connected | stub only | connected | partially connected | connected | connected | connected | connected | connected | connected | partially connected | connected | partially connected | connected |
| Diagnostics | connected | connected | partially connected | unknown | partially connected | partially connected | unknown | partially connected | partially connected | partially connected | partially connected | partially connected | partially connected | partially connected | connected | connected |
| Storage | connected | connected | connected | unknown | connected | connected | connected | connected | connected | connected | connected | connected | connected | connected | connected | connected |

## Flags

- Dashboard settings can mutate runtime config, but not every dashboard field has an end-to-end proof that Discord replies consume it.
- Second Life chat reaches the companion pipeline, while many SL commands/world updates operate as bridge-local behavior.
- Schedules and life runtimes write several stores; not every scheduled action has a canonical memory/journal trace.
- Dreams and travel have dashboard/storage presence but weaker proof of later prompt retrieval.
- Diagnostics are strong for health/dashboard/repository checks but only partially cover background worker outcomes.
