# API Route Audit

All HTTP routes served by the ghostlight-bot health/admin server.

## Auth Types

- **none** — No authentication required
- **admin-basic** — HTTP Basic Auth (ADMIN_USERNAME + ADMIN_PASSWORD or ADMIN_SECRET)
- **bridge-secret** — x-bridge-secret header (or Authorization Bearer token or body.secret)

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | none | Root health check — returns 200 OK |
| GET | /health | none | Health check endpoint |
| GET | /api/status | none | App status (version, uptime, ready flag) |
| POST | /api/second-life/register | bridge-secret | Register a Second Life avatar/companion |
| POST | /api/second-life/heartbeat | bridge-secret | SL bridge heartbeat / keepalive |
| POST | /api/second-life/event | bridge-secret | Process a SL world event |
| POST | /api/second-life/poll | bridge-secret | Poll for pending SL commands |
| POST | /api/second-life/command-result | bridge-secret | Report SL command execution result |
| POST | /api/second-life/avatar-scan | bridge-secret | Report avatar scan data |
| POST | /api/second-life/object-scan | bridge-secret | Report object scan data |
| POST | /api/second-life/location | bridge-secret | Report companion location update |
| GET | /api/second-life/status/:companionId | bridge-secret | Get SL companion status |
| GET | /admin | admin-basic | Admin dashboard HTML |
| GET | /admin/* | admin-basic | Admin dashboard static assets / sub-pages |
| GET | /admin/api/settings | admin-basic | List all runtime settings |
| POST | /admin/api/settings | admin-basic | Save runtime settings to DB |
| GET | /admin/api/memories | admin-basic | List memories |
| POST | /admin/api/memories | admin-basic | Create/update memory |
| DELETE | /admin/api/memories/:id | admin-basic | Delete memory |
| GET | /admin/api/journal | admin-basic | List journal entries |
| POST | /admin/api/journal | admin-basic | Create journal entry |
| DELETE | /admin/api/journal/:id | admin-basic | Delete journal entry |
| GET | /admin/api/images | admin-basic | List generated images |
| GET | /admin/api/audio | admin-basic | List generated audio |
| GET | /admin/api/music | admin-basic | Music library overview |
| GET | /admin/api/games | admin-basic | Games system status |
| GET | /admin/api/heartbeat | admin-basic | Heartbeat actions status |
| POST | /admin/api/heartbeat | admin-basic | Update heartbeat actions |
| GET | /admin/api/automations | admin-basic | List automations |
| POST | /admin/api/automations | admin-basic | Create/update automation |
| DELETE | /admin/api/automations/:id | admin-basic | Delete automation |
| GET | /admin/api/second-life | admin-basic | Second Life bridge settings |
| POST | /admin/api/second-life | admin-basic | Update Second Life bridge settings |

## Security Notes

- ALL `/api/second-life/*` routes use `bridge-secret` auth, NOT admin-basic auth. This is intentional — the bridge is machine-to-machine from the SL viewer.
- The `x-bridge-secret` is validated INSIDE the handler, not at the HTTP server middleware level.
- `/health` and `/api/status` are intentionally unauthenticated for Railway health checks.
- Admin dashboard routes all require HTTP Basic Auth via the `withAdmin()` middleware.
