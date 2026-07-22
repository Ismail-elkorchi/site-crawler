# CLI operations

## Crawl and resume

```bash
site-crawler crawl https://example.com --out ./runs
site-crawler resume ./runs/run_123
site-crawler abort ./runs/run_123 --reason "maintenance"
```

Resume validates the current run format, configuration policy, storage backend, lock state, checkpoints, and worker state before continuing.

## Inspection and validation

```bash
site-crawler inspect ./runs/run_123
site-crawler validate-run ./runs/run_123
site-crawler validate-config ./crawler.json
site-crawler doctor
```

Inspection is read-only. Validation checks schemas, referenced files, evidence, indexed records, and metadata. `doctor` reports runtime, platform, SQLite, filesystem, and browser-adapter concerns.

## Maintenance and export

```bash
site-crawler checkpoint ./runs/run_123
site-crawler compact ./runs/run_123
site-crawler export ./runs/run_123 --out ./exported
```

Compaction and checkpoint operations require exclusive ownership. Export produces portable factual records without mutating the run.

## Replay, comparison, and evidence

```bash
site-crawler replay ./runs/run_123 --out replay.json
site-crawler compare ./runs/run_123 ./runs/run_456 --out changes.json
site-crawler evidence-bundle ./runs/run_123 --out ./bundle --gzip
```

Replay and comparison make no network requests. Evidence bundle creation validates containment and hashes before reporting success.

## Exit codes

- `0`: command completed successfully;
- `1`: invalid command or configuration;
- `2`: run failure or invalid run evidence;
- `4`: crawl aborted by caller or signal.
