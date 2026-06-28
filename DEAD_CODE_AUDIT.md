# DEAD_CODE_AUDIT.md

## Tooling used
- `rg --files`, `find`, package script inspection, `rg` reference checks, `git ls-files`, baseline verifiers.

## Removed high-confidence dead code
| Path | Reason | Evidence | Confidence | Action |
| --- | --- | --- | --- | --- |
| `verify-norwegian-*.mjs` at repo root | Stale legacy verification scripts outside active `scripts/` workspace | No active package script invokes root copies; `rg` found no references for most files and only historical archive mentions for dashboard copies; root package scripts invoke `node scripts/...` | high | remove |

## Kept / needs review
| Path | Reason it appears unused | Evidence | Confidence | Action |
| --- | --- | --- | --- | --- |
| `artifacts/api-server/dist/*` | Generated output can be bloat | Workspace includes `build.mjs` and `src`; however deployment may consume `dist` | medium | needs human review |
| `archive/planning/*` | Historical plans only | Not runtime imported | medium | keep for now |
| Multiple one-off verifier scripts | Many are not package-script referenced | They are operational audit tools and may be manually invoked | low | keep |
| Generated API clients | Generated and potentially reproducible | Published workspace packages may depend on committed output | low | keep |

## Dependency audit
No dependency was removed. Package usage requires deeper runtime validation because this bot uses dynamic/manual scripts and service integrations.
