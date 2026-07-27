# Public API

The package root contains the normal crawl API:

- `SiteCrawler`
- configuration parsing, validation, and resolution
- `CrawlEventHub`
- configuration, result, event, extension, HTTP-client, and renderer types

Additional capabilities use explicit package subpaths:

```text
@ismail-elkorchi/site-crawler
@ismail-elkorchi/site-crawler/schemas
@ismail-elkorchi/site-crawler/playwright
@ismail-elkorchi/site-crawler/storage
@ismail-elkorchi/site-crawler/query
@ismail-elkorchi/site-crawler/opentelemetry
@ismail-elkorchi/site-crawler/evidence
@ismail-elkorchi/site-crawler/replay
@ismail-elkorchi/site-crawler/diff
@ismail-elkorchi/site-crawler/runs
@ismail-elkorchi/site-crawler/operations
@ismail-elkorchi/site-crawler/workers
@ismail-elkorchi/site-crawler/security
```

Paths not listed in `package.json#exports` are internal.

## Schemas and runtime validation

The `schemas` subpath contains both the persistent schema catalog and runtime contract validation:

```ts
import {
  persistentSchemas,
  schemaForId,
  validateContract,
  validatePersistentValue,
} from "@ismail-elkorchi/site-crawler/schemas";

const manifest = validateContract("run-manifest", unknownManifest);
const result = validatePersistentValue(unknownManifest);
```

Schema documents use stable `urn:site-crawler:schema:...` identifiers. The project supports one current schema version at a time. A future schema change updates producers, readers, validators, and tests together.

## Adapter boundaries

`HttpClient` and `RenderAdapter` are exported as root types. Custom implementations are injected through the second `SiteCrawler` constructor argument. Configuration remains plain serializable data.

The OpenTelemetry adapter uses structural interfaces, so the package does not require an OpenTelemetry SDK.

## TypeScript policy

Published declarations are generated from strict TypeScript with exact optional properties, unchecked indexed access, isolated declarations, and no skipped library checking. Public inputs that cross a JavaScript boundary are validated at runtime rather than trusted through TypeScript alone.
