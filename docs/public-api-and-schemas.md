# Public API and persistent schemas

## Stability classes

The package API is divided into three classes:

- **stable**: package root and documented subpaths; changes require review;
- **experimental**: `site-crawler/experimental`; APIs may change before 1.0;
- **internal**: files below `dist` that are not package exports; unsupported for consumers.

The declaration snapshot in `api/declarations.sha256.json` records every exported declaration surface. `npm run api:check` fails when declarations change without updating the reviewed snapshot.

## Stable subpaths

```text
site-crawler
site-crawler/config
site-crawler/events
site-crawler/adapters
site-crawler/schemas
site-crawler/playwright
site-crawler/storage
site-crawler/query
site-crawler/opentelemetry
site-crawler/contracts
site-crawler/evidence
site-crawler/replay
site-crawler/diff
site-crawler/runs
site-crawler/operations
site-crawler/workers
site-crawler/security
```

`site-crawler/experimental` may change before publication.

## Runtime contracts

`site-crawler/contracts` maps stable contract names and schema identities to runtime parsers. The repository supports one schema version at a time, currently numeric version `1`. A later version replaces that current version across producers, parsers, schemas, and fixtures as one coordinated change.

```ts
import {
  contractForName,
  contractForSchema,
  runtimeContracts,
  validateContract,
} from "site-crawler/contracts";
```

Unknown data is validated once at the boundary. Persistent producers also validate their output before writing it. Contract names and complete schema identities are unique, current record shapes are exact at the top level, and discriminated values such as evidence completeness and parser status retain their variant-specific fields. Internal code consumes already-validated domain values rather than repeatedly casting or revalidating them.

## JSON Schemas

`site-crawler/schemas` exposes the persistent schema catalog and validation helpers. Generated files are stored in `schemas/` and checked in CI.

Before the first stable persistence format, this repository maintains one current numeric version `1` contract rather than retaining unpublished migrations. A shape change requires:

1. an intentional review of the current runtime contract and TypeScript owner;
2. updates to every producer and parser of that record;
3. regenerated schema files;
4. updated declaration and API snapshots;
5. boundary and public-surface tests.

The TypeScript declarations remain the implementation contract. JSON Schemas provide language-neutral validation and operational tooling.
