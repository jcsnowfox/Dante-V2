# Travel Saga persistence notes

Dante-V2 Travel Saga currently uses the JSON-backed travel store. Do not migrate it to Postgres until a dedicated schema pass is planned.

## Environment variables

The store resolves its JSON file in this order:

1. An explicit `filePath` passed by tests or local tooling.
2. `TRAVEL_ADVENTURES_FILE`.
3. `TRAVEL_DATA_PATH`.
4. Default: `data/travel-adventures.json` under the process working directory.

Only the basename is shown in the admin diagnostic surface. Full filesystem paths should not be exposed in the dashboard.

## Railway deployment guidance

For Railway, set one of these to a mounted persistent volume path, for example:

```text
TRAVEL_ADVENTURES_FILE=/data/dante-v2/travel-adventures.json
```

`TRAVEL_DATA_PATH` is supported as a legacy/alternate name, but `TRAVEL_ADVENTURES_FILE` is preferred because it points directly to the JSON file.

## Redeploy warning

The default `data/travel-adventures.json` path is suitable for local development. In a deployed Railway environment it may not survive redeploys unless the directory is backed by a persistent volume. If `/admin/travel` shows storage unavailable or an empty store after deploy, check:

- app context initialization for `travelAdventureStore`
- `TRAVEL_ADVENTURES_FILE` / `TRAVEL_DATA_PATH`
- Railway persistent volume mount configuration

## Concierge scope

The current Concierge surface is a planning brief/preview only. Live web lookup, bookings, hotel search, restaurant lookup, and itinerary lookups are not connected unless a future evidence-backed tool provides real results.
