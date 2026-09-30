# Changelog

## Unreleased

- Updated production and development dependencies to current stable releases, retaining TypeScript 6.0.3 until the lint tooling supports TypeScript 7.
- Adopted the current HTML fragment result tree contract for iframe srcdoc discovery.
- Removed unused internal runtime/configuration types and the unused UTF-16 truncation helper.

- Fixed reentrant enqueue and skip hooks by notifying after admission accounting and reservations commit.
- Consolidated admission coordination in the scheduler while retaining frontier and scope policy boundaries.
- Made fatal errors, cancellation, and hard limits take precedence over soft admission limits.
- Removed duplicate session-cookie validation.

## 0.1.0

- Added strict TypeScript crawler, CLI, durable memory/filesystem/SQLite frontiers, and typed result storage.
- Added scoped crawling, robots and sitemap handling, HTTP/1.1 and HTTP/2 transport, bounded response bodies, sessions, cache revalidation, and optional Playwright rendering.
- Added HTML, XML, JavaScript, and CSS discovery with structured evidence and diagnostics.
- Added durable resume, content-addressed evidence, offline replay, run comparison, read-only queries, operations, worker coordination, and security checks.
- Added current-schema runtime validation, private storage permissions, crash recovery, resource-leak checks, browser qualification, and clean package-consumer verification.
