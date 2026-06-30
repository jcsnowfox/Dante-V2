# Dead Code and Bloat Audit

## Evidence gathered
- Reviewed package scripts and existing verifier chain.
- Searched for TODO/FIXME/HACK/deprecated/unused/stub/mock/fake/placeholder/Not implemented markers.
- Inspected generated/artifact-heavy areas conservatively.

## Findings
- No files were removed in this pass. The repo contains many compatibility surfaces and generated/artifact directories, but high-confidence deletion requires route/import/script proof per file.
- Existing verifier scripts are numerous but actively referenced by `verify:all`; no duplicate verifier was removed.
- Media and prompt tests include mocks, but key attachment tests now assert actual Discord send payloads contain files.

## Recommended follow-up
- Run `knip` if dependency installation/environment supports it and classify unused exports/dependencies into: delete now, optional feature, generated artifact, or compatibility shim.
- Add a generated-artifact policy before removing committed artifacts.
