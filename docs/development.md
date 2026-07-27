# Development

## Setup

```bash
npm ci
npm run check
npm test
```

`check` runs the TypeScript compiler, typed ESLint, dependency-architecture checks, and formatting. `test` builds once and runs the complete Node test suite with a global watchdog.

## Focused qualification

```bash
npm run test:browser
npm run verify:crash
npm run verify:leaks
npm run verify:clean-install
npm run verify:package
```

- `test:browser` requires Chromium and exercises the real Playwright adapter.
- `verify:crash` terminates test-owned child fixtures around journal persistence and verifies recovery.
- `verify:leaks` checks file-backed body cleanup and retained runtime resources.
- `verify:clean-install` installs the lockfile from a fresh public npm cache.
- `verify:package` packs the project, installs that exact tarball into a clean consumer from the public registry, checks JavaScript and strict TypeScript imports, and runs the installed CLI.

`npm run verify:release` combines the required release qualification.

## Benchmarks

```bash
npm run benchmark
npm run benchmark:load
```

Benchmarks are manual diagnostics. They report workload facts, elapsed time, and memory observations without treating machine-specific timing or RSS values as correctness. `benchmark:load` defaults to a large SQLite frontier workload and can be sized with `SITE_CRAWLER_FRONTIER_REQUESTS`.

## Source organization

- `src/crawler` coordinates crawl policy and lifecycle.
- `src/crawler/runtime` composes the runtime graph.
- `src/frontier`, `src/http`, and `src/storage` own scheduling, transport, and persistence.
- `src/html`, `src/xml`, `src/javascript`, and `src/css` own extraction.
- `src/evidence`, `src/replay`, `src/diff`, and `src/operations` implement offline workflows.
- Files named `public.ts` are package subpath entries; `src/index.ts` is the package root.

Internal modules do not import the package root. The architecture check rejects dependency cycles, unreachable TypeScript files, invalid dependency direction, and unlisted root source files.

## Change discipline

Add focused tests next to the affected domain. Prefer a typed boundary and an explicit state model over casts or compatibility branches. Delete superseded code and update current persisted contracts atomically when their shape changes.
