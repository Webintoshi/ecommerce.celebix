# Toshi Provider Message Orchestration Implementation Plan

**Goal:** Turn the connected store-owned OpenAI, Gemini or Anthropic credential into a durable, store-scoped Toshi conversation runtime without automatic cross-provider fallback or direct unconfirmed writes.

**Architecture:** Keep provider connection authority in the existing Toshi provider vault. Add durable PostgreSQL conversations/messages, one generation adapter per official provider, a server-only orchestration runtime, read-only store tools and a same-origin streaming chat API. Every conversation pins one provider/model snapshot; provider errors remain explicit and never trigger a hidden provider switch.

**Tech Stack:** PostgreSQL 16, TypeScript, Next.js App Router, Web Streams, existing Celebix tenant/session authority, existing merchant credential AES-256-GCM keyring.

---

## Task 1: Durable conversation contracts

Create exact, secret-free shared DTOs for conversations, messages, citations, tool results and provider/model snapshots. Bound message text, history length, citations and tool payload sizes. Add parser tests for exact keys, hostile prototypes, duplicate IDs, invalid timestamps and hidden credential fields.

## Task 2: PostgreSQL conversation and message authority

Add store-scoped `toshi_conversations`, `toshi_messages`, `toshi_generation_operations` and append-only `toshi_generation_events`. Use RLS/FORCE RLS, full tenant authority, optimistic versions, idempotent operation fingerprints and commit-unknown recovery. Pin provider/config/credential version/model to each generation turn. Public projections must never return encrypted credentials or raw provider payloads.

## Task 3: Conversation repository

Implement a bounded PostgreSQL repository for list/create/get/append/finalize/recover. Follow the same transaction, timeout, role, rollback and connection-destruction rules as the provider repository. Test tenant isolation, operation replay, version conflicts, bounded history and byte-identical recovery.

## Task 4: Official generation adapters

Implement:

- OpenAI Responses API with `store: false`;
- Gemini `models/{model}:generateContent`;
- Anthropic Messages API.

Each adapter consumes temporary key bytes, validates the pinned model, disables redirects, bounds request/response sizes, maps provider errors to stable safe codes and clears mutable secret buffers. Normalize text/tool calls without retaining raw provider responses.

## Task 5: Read-only store tool registry

Expose minimum-data, store-authorized tools for catalog search, order lookup, customer lookup, sales summary and safe navigation. Reuse existing repository contracts and action checks. Return only fields needed to answer the current request. No create/update/archive/refund/payment action belongs in this phase.

## Task 6: Server orchestration runtime

Resolve the conversation’s pinned provider authority, decrypt the key only server-side, assemble a bounded system policy/history/tool schema, call exactly that provider, execute approved read-only tool calls and persist the normalized assistant result. Never fall back to another connected provider automatically. If the pinned provider is revoked or unavailable, return an explicit safe state.

## Task 7: Same-origin chat API

Add authenticated list/create/read/send endpoints under `/api/toshi`. Require exact paths, same-origin mutations, panel session cookies, idempotency keys and bounded JSON. Stream only normalized events. Abort provider work on client disconnect where safe; recover uncertain database commits by operation ID.

## Task 8: Toshi workspace integration

Replace local-only answers with the provider runtime when a default connection exists. Show the pinned provider/model in a compact status control, retain the existing local safe navigation fallback only when no provider is configured, and never silently switch providers. Preserve duplicate-submit guards, abort on unmount and authoritative conversation reload.

## Task 9: Verification and staging acceptance

Run contract, migration, repository, adapter, orchestration, HTTP, UI, typecheck and production build suites. In staging, connect disposable provider-owned credentials, create one conversation per provider, verify model pinning and citations, revoke a provider and confirm the conversation fails explicitly without cross-provider fallback. Confirm raw keys and raw provider responses are absent from DOM, logs and API responses.

## Explicit boundary

Write-capable store actions require a later preview/confirm/execute authority plan with human confirmation, idempotency, audit and recovery. This plan does not authorize Toshi to change products, orders, customers, payments or settings.
