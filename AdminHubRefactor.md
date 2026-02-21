# Admin Hub Refactor Playbook
## Risk Intelligence Architecture Evolution

## 1) Purpose
This document is the execution playbook for evolving Audit Hub into a Feedback-Calibrated Risk Intelligence Framework.

This is planning and coordination only. No implementation details here should violate these invariants.

## 2) Non-Negotiable Invariants
- Deterministic risk engine is source of truth.
- AI is advisory only.
- No probabilistic logic in DB write path.
- All actions must be registry-bound.
- Feedback calibration must be bounded and reversible.
- All critical decisions must be auditable.

## 3) Agent Roster
- Lead Orchestrator Agent
- System Architect Agent
- Edge Case and Security Agent
- UX/UI Agent
- API and Event Infrastructure Agent
- Metrics and Calibration Agent

## Agent Introductions
### Lead Orchestrator Agent
Owns execution governance across all phases: decides phase entry/exit, promotion timing, and go/no-go at each `ToReview` gate. Required outputs are phase charters, dependency confirmations, gate signoff decisions, and a concise risk register update when scope or sequencing changes.

### System Architect Agent
Owns contract correctness and compatibility: decides canonical schemas, lifecycle states, versioning policy, and fallback compatibility rules that other agents must implement against. Required outputs are versioned interface contracts, transition rules, compatibility notes, and explicit deprecation/rollback constraints per phase.

### Edge Case and Security Agent
Owns abuse resistance and safety controls: decides threat-model coverage, required guardrails, and fail-safe behavior for replay, poisoning, bypass, and injection scenarios. Required outputs are adversarial test matrices, control requirements, gate-blocking findings, and remediation acceptance criteria tied to each phase.

### UX/UI Agent
Owns operator-facing clarity and action safety in the Admin Hub: decides state presentation, deterministic-vs-AI separation, and rationale/override interaction requirements. Required outputs are UI behavior specs, state and copy conventions, error/conflict handling definitions, and review-ready acceptance checks for admin workflows.

### API and Event Infrastructure Agent
Owns async execution path integrity: decides queue/worker state flow, idempotency mechanisms, retry/DLQ policy, and enforcement checkpoints before side effects. Required outputs are sequence diagrams or execution plans, endpoint/event contracts, failure recovery rules, and integration readiness criteria for each handoff.

### Metrics and Calibration Agent
Owns measurable system health and bounded learning behavior: decides KPI catalog, thresholds, drift/divergence detection logic, and rollback trigger policy. Required outputs are metric definitions, alert matrices, baseline/trend reports, and calibration governance criteria that gate release and post-release changes.

## 4) Phase Order and Dependencies
1. Phase 1: Risk Model Normalization
2. Phase 2: Post-Commit Reviewer Layer
3. Phase 3: Action Registry and Guardrails
4. Phase 4: AI Explanation Overlay
5. Phase 5: Feedback Calibration Engine
6. Phase 6: Metrics and Observability

Dependency rules:
- Phase 2 depends on Phase 1 contracts.
- Phase 3 depends on Phase 2 processing.
- Phase 4 depends on Phase 3 guardrails.
- Phase 5 depends on Phase 2 and Phase 4 data contracts.
- Phase 6 runs in parallel but cannot be finalized before Phase 5.

## Parallel Async Work Model
Within each phase, all six agents execute `ToPlan` and `ToExecute` in parallel against the same phase contract, then converge at a single `ToReview` merge gate. Merge is allowed only for outputs that satisfy agent-specific acceptance checks and do not violate upstream dependency contracts; conflicts are resolved by the owning decision agent (or escalated to Lead Orchestrator when cross-domain). Review gates are phase-sequenced: downstream phase work may start as draft in parallel, but promotion to active execution requires upstream `ToReview` completion and explicit orchestrator signoff; release-level merge requires all phase gates plus the final cross-phase checklist.

## 5) Current Status Snapshot
- Phase 1: Implemented foundation
- Phase 2: Partial
- Phase 3: Implemented foundation
- Phase 4: Partial
- Phase 5: Partial
- Phase 6: Partial

---

## Phase 1 - Risk Model Normalization

### ToPlan
#### Lead Orchestrator Agent
- [ ] Confirm canonical risk scoring contract (0-100, levels, contribution schema).
- [ ] Define Phase 1 exit criteria and handoff to Phase 2.

#### System Architect Agent
- [ ] Lock `DomainEvent -> RiskScore` mapping contract.
- [ ] Define versioning policy for deterministic engine output.

#### Edge Case and Security Agent
- [ ] Define abuse cases for metadata-inflated scoring.
- [ ] Define deterministic threshold boundary tests.

#### UX/UI Agent
- [ ] Plan score and contribution display model for Admin Hub.
- [ ] Define copy conventions for deterministic source labels.

#### API and Event Infrastructure Agent
- [ ] Plan where deterministic score will be computed in async reviewer flow.
- [ ] Confirm write-path stays clean.

#### Metrics and Calibration Agent
- [ ] Define baseline metrics for score distribution and risk-level mix.
- [ ] Set warning/critical drift thresholds.

### ToExecute
#### Lead Orchestrator Agent
- [ ] Run design review and approve contract freeze.

#### System Architect Agent
- [ ] Publish deterministic score schema v1.

#### Edge Case and Security Agent
- [ ] Run planned edge-case checklist.

#### UX/UI Agent
- [ ] Produce UI data contract requirements for contribution rendering.

#### API and Event Infrastructure Agent
- [ ] Produce integration sequence for reviewer consumption.

#### Metrics and Calibration Agent
- [ ] Produce baseline report and threshold definitions.

### ToReview
#### Global Gate
- [ ] Deterministic output is normalized and explainable.
- [ ] No probabilistic dependency introduced.
- [ ] Phase 2 contract dependencies are satisfied.

---

## Phase 2 - Post-Commit Reviewer Layer

### ToPlan
#### Phase 2 Execution Tracks (Known Status)
- [ ] Lease/lock strategy checklist drafted. `Status: In Progress (known)`
- [ ] Retry/backoff policy checklist drafted. `Status: In Progress (known)`
- [ ] Dead-letter handling checklist drafted. `Status: In Progress (known)`
- [ ] Admin visibility endpoint checklist drafted. `Status: In Progress (known)`

#### Lead Orchestrator Agent
- [ ] Confirm post-commit state machine and failure semantics.
- [ ] Define go/no-go thresholds for queue reliability.

#### System Architect Agent
- [ ] Define assessment lifecycle contract (`pending/processing/completed/failed`).
- [ ] Define idempotent linkage from audit event to assessment.

#### Edge Case and Security Agent
- [ ] Define replay, race, and poison-message threat model.
- [ ] Define required idempotency controls and anti-duplication tests.

#### UX/UI Agent
- [ ] Define UI expectations for processing and failed states.

#### API and Event Infrastructure Agent
- [ ] Design ingest loop, worker loop, retry strategy, DLQ behavior.
- [ ] Define lock/lease approach and backoff schedule.
- [ ] Define admin visibility endpoint contracts for queue and assessment state introspection.

#### Metrics and Calibration Agent
- [ ] Define queue health metrics (coverage, fail rate, retry volume, latency).

### ToExecute
#### Phase 2 Execution Tracks (In-Progress Checklist)
##### Lease/Lock
- [ ] Lease acquisition and renewal path implemented. `Status: In Progress (known)`
- [ ] Lock expiry and recovery path verified.
- [ ] Duplicate worker-claim protection validated under concurrency.

##### Retry/Backoff
- [ ] Retry classifier (transient vs terminal) implemented. `Status: In Progress (known)`
- [ ] Backoff schedule (bounded with jitter) enforced.
- [ ] Retry budget and max-attempt enforcement validated.

##### Dead-Letter Handling
- [ ] DLQ write path for terminal failures implemented. `Status: In Progress (known)`
- [ ] DLQ reason codes and payload shape standardized.
- [ ] Replay/re-drive path with audit trail defined and validated.

##### Admin Visibility Endpoints
- [ ] Admin endpoints for queue depth, retry counts, and failed items implemented. `Status: In Progress (known)`
- [ ] Endpoint filtering/pagination for operational triage validated.
- [ ] Access control and audit logging for admin visibility endpoints validated.

#### Lead Orchestrator Agent
- [ ] Approve state machine rollout order.

#### System Architect Agent
- [ ] Publish state transition contract and compatibility notes.

#### Edge Case and Security Agent
- [ ] Validate idempotency and replay protections.

#### UX/UI Agent
- [ ] Provide display spec for in-flight and terminal states.

#### API and Event Infrastructure Agent
- [ ] Deliver execution plan for post-commit reviewer pipeline.
- [ ] Deliver admin visibility endpoint execution plan and rollout sequencing.

#### Metrics and Calibration Agent
- [ ] Deliver monitoring plan and rollback trigger levels.

### ToReview
#### Phase 2 Execution Tracks (Review Gate)
- [ ] Lease/lock behavior prevents duplicate processing at production concurrency.
- [ ] Retry/backoff policy is bounded, observable, and aligned with SLO thresholds.
- [ ] Dead-letter handling supports triage and safe replay without data loss.
- [ ] Admin visibility endpoints provide actionable operational state and remain least-privilege gated.

#### Global Gate
- [ ] Reviewer is post-commit and non-blocking to primary writes.
- [ ] Duplicate processing is prevented.
- [ ] Failure recovery path is documented and testable.

---

## Phase 3 - Action Registry and Guardrails

### ToPlan
#### Lead Orchestrator Agent
- [ ] Confirm guardrail policy hierarchy (registry > confidence > divergence).

#### System Architect Agent
- [ ] Define versioned action catalog contract.
- [ ] Define persistence shape for blocked reasons and policy version.

#### Edge Case and Security Agent
- [ ] Define unregistered-action, prompt-action, and policy bypass scenarios.
- [ ] Define kill-switch behavior and escalation matrix.

#### UX/UI Agent
- [ ] Define how allowed vs blocked actions are explained to admins.

#### API and Event Infrastructure Agent
- [ ] Define enforcement checkpoint in worker flow before any side effects.

#### Metrics and Calibration Agent
- [ ] Define action block/allow KPIs and abnormal thresholds.

### ToExecute
#### Lead Orchestrator Agent
- [ ] Approve enforce mode entry criteria.

#### System Architect Agent
- [ ] Publish registry compatibility and deprecation policy.

#### Edge Case and Security Agent
- [ ] Execute guardrail attack simulation plan.

#### UX/UI Agent
- [ ] Finalize UI specs for guardrail visibility and reasons.

#### API and Event Infrastructure Agent
- [ ] Finalize ordering constraints around registry validation.

#### Metrics and Calibration Agent
- [ ] Finalize actionable alert thresholds for guardrail anomalies.

### ToReview
#### Global Gate
- [ ] All suggested actions are registry-bound.
- [ ] Unsafe/unregistered actions are blocked and auditable.
- [ ] Kill switch is clear and operational.

---

## Phase 4 - AI Explanation Overlay

### ToPlan
#### Lead Orchestrator Agent
- [ ] Confirm AI overlay stays advisory and cannot mutate state.

#### System Architect Agent
- [ ] Define strict AI output schema and validation policy.
- [ ] Define fallback contract when AI unavailable/invalid.

#### Edge Case and Security Agent
- [ ] Define divergence and confidence enforcement requirements.
- [ ] Define prompt-injection and instruction-smuggling test plan.

#### UX/UI Agent
- [ ] Define deterministic vs AI visual separation model.
- [ ] Define divergence/confidence communication model.

#### API and Event Infrastructure Agent
- [ ] Define overlay invocation placement in async reviewer flow.

#### Metrics and Calibration Agent
- [ ] Define overlay KPIs (`divergence_p95`, `confidence_gate_blocked`, failure rate).

### ToExecute
#### Lead Orchestrator Agent
- [ ] Approve advisory-only verification checklist.

#### System Architect Agent
- [ ] Publish schema validation and fallback spec.

#### Edge Case and Security Agent
- [ ] Validate divergence hard-stop and fallback behavior.

#### UX/UI Agent
- [ ] Deliver UI behavior spec for low-confidence/high-divergence states.

#### API and Event Infrastructure Agent
- [ ] Deliver sequence plan for overlay evaluation and persistence.

#### Metrics and Calibration Agent
- [ ] Deliver overlay observability pack and alert thresholds.

### ToReview
#### Global Gate
- [ ] AI cannot change deterministic final authority.
- [ ] Invalid AI output fails safely.
- [ ] Divergence/confidence controls are visible and measurable.

---

## Phase 5 - Feedback Calibration Engine

### ToPlan
#### Lead Orchestrator Agent
- [ ] Confirm governance model for calibration changes and reversibility.

#### System Architect Agent
- [ ] Define calibration profile versioning and rollback checkpoint format.
- [ ] Define feedback record provenance and idempotency requirements.

#### Edge Case and Security Agent
- [ ] Define feedback poisoning and calibration drift abuse model.
- [ ] Define rate limits, quorum rules, and anti-replay controls.

#### UX/UI Agent
- [ ] Define feedback and override workflows with required rationale.
- [ ] Define conflict states (`stale version`, `already overridden`).

#### API and Event Infrastructure Agent
- [ ] Define endpoint workflow for feedback submission and history retrieval.

#### Metrics and Calibration Agent
- [ ] Define calibration stability KPIs and rollback thresholds.

### ToExecute
#### Lead Orchestrator Agent
- [ ] Approve policy for bounded updates and rollback conditions.

#### System Architect Agent
- [ ] Publish reversible calibration lifecycle spec.

#### Edge Case and Security Agent
- [ ] Run feedback abuse simulation and produce mitigations.

#### UX/UI Agent
- [ ] Finalize interaction spec for feedback submit + traceability timeline.

#### API and Event Infrastructure Agent
- [ ] Finalize event trail requirements for feedback events.

#### Metrics and Calibration Agent
- [ ] Finalize metrics formulas for false positive and override trends.

### ToReview
#### Global Gate
- [ ] Calibration updates are bounded.
- [ ] Calibration updates are reversible.
- [ ] Feedback effects are traceable per org/profile version.

---

## Phase 6 - Metrics and Observability

### ToPlan
#### Lead Orchestrator Agent
- [ ] Confirm operational SLOs and release criteria.

#### System Architect Agent
- [ ] Define metric naming/versioning and compatibility strategy.

#### Edge Case and Security Agent
- [ ] Define metrics abuse and high-cardinality risk controls.

#### UX/UI Agent
- [ ] Define admin dashboards and warning interaction states.

#### API and Event Infrastructure Agent
- [ ] Define metric emission points without adding write-path latency.

#### Metrics and Calibration Agent
- [ ] Define final KPI catalog with warning/critical thresholds and rollback triggers.

### ToExecute
#### Lead Orchestrator Agent
- [ ] Approve observability readiness for production rollout.

#### System Architect Agent
- [ ] Publish schema-contract for risk telemetry payloads.

#### Edge Case and Security Agent
- [ ] Validate alerting and abuse-resistance controls.

#### UX/UI Agent
- [ ] Finalize dashboard interaction requirements.

#### API and Event Infrastructure Agent
- [ ] Finalize metrics integration sequence for server and admin endpoints.

#### Metrics and Calibration Agent
- [ ] Deliver final KPI matrix and incident trigger rules.

### ToReview
#### Global Gate
- [ ] Drift, divergence, false positives, and override frequencies are measurable.
- [ ] Alerting thresholds are documented and actionable.
- [ ] Rollback triggers are clearly defined and tested.

---

## 6) Cross-Phase ToReview Checklist (Final Release Gate)
- [ ] Deterministic engine remains source of truth in all flows.
- [ ] AI is advisory-only across all endpoints and UIs.
- [ ] No probabilistic logic exists on DB write path.
- [ ] Action execution is registry-bound and auditable.
- [ ] Feedback calibration is bounded and reversible.
- [ ] Idempotency and replay safety are validated.
- [ ] Observability and rollback runbooks are complete.

## 7) Operating Instructions
- Use this document as the single coordination board.
- Each agent updates only its own checklist items.
- Lead Orchestrator owns gate signoff and phase promotion.
- No phase promotion without completing `ToReview` gate for that phase.
