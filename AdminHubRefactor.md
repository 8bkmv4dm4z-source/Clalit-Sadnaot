# Admin Hub Refactor Playbook (Compact)

## 1) Purpose
Evolve Admin Hub from audit viewing to a **feedback-calibrated risk intelligence framework**.

Scope priorities:
- Deterministic scoring is primary truth.
- Async post-commit reviewer processes audit logs.
- Admin UI exposes operational queue state and controls.
- Calibration is bounded, reversible, and auditable.

## 2) Non-Negotiable Invariants
- Deterministic risk engine is source of truth.
- AI is advisory only.
- No probabilistic logic in DB write path.
- Actions are registry-bound.
- Calibration is bounded/reversible.
- Critical decisions are auditable.

## 3) Agent Roster
- Lead Orchestrator: phase governance, sequencing, go/no-go.
- System Architect: contracts, compatibility, versioning.
- Edge Case & Security: abuse resistance, guardrails, safety.
- UX/UI: operator clarity and safe workflows.
- API/Event Infrastructure: queue/worker/idempotency/retry/DLQ.
- Metrics & Calibration: KPIs, drift detection, rollback triggers.

## 4) Phase Order and Dependencies
1. Phase 1: Risk Model Normalization
2. Phase 2: Post-Commit Reviewer Layer
3. Phase 3: Action Registry and Guardrails
4. Phase 4: AI Explanation Overlay
5. Phase 5: Feedback Calibration Engine
6. Phase 6: Metrics and Observability

Dependencies:
- P2 depends on P1 contracts.
- P3 depends on P2 processing.
- P4 depends on P3 guardrails.
- P5 depends on P2 + P4 contracts.
- P6 can run in parallel, finalization after P5.

## 5) Execution Model
Within each phase:
- `ToPlan` (all agents in parallel)
- `ToExecute` (all agents in parallel)
- `ToReview` (single merge gate)

Merge rule:
- Merge only outputs that satisfy acceptance checks and upstream contracts.
- Domain-owner resolves conflicts; escalate cross-domain to Lead Orchestrator.

## 6) Review Authority and Completion Rules
- No task/phase/release is complete without reviewer approval.
- Implementer cannot self-approve.
- Required order: `ToPlan -> ToExecute -> ToReview -> Approved`.
- Material change after approval reopens the gate.

Required approvals:
- Item completion: assigned reviewer.
- Phase completion: Lead Orchestrator + domain reviewers.
- Final release: all six agents.

Mandatory signoff block (use at each phase/release gate):
- Gate
- Decision
- Reviewer
- Role
- Timestamp (UTC)
- Evidence
- Open Risks
- Re-review Required After Change

---

## 7) Current Snapshot
- Phase 1: Completed
- Phase 2: Active execution (foundation implemented)
- Phase 3: Foundation implemented
- Phase 4: Partial
- Phase 5: Partial
- Phase 6: Partial

---

## 8) Phase Summaries

### Phase 1 - Risk Model Normalization
**Goal**: Freeze deterministic scoring contract and baseline thresholds.

ToPlan:
- Canonical score contract (0-100, levels, contributions).
- Version policy for deterministic output.
- Boundary and abuse-case tests.
- UI contract for deterministic display only.

ToExecute:
- Publish schema v1 and threshold rules.
- Validate deterministic-only write path.
- Add boundary tests.
- Define baseline metrics specs and drift thresholds.

ToReview:
- Output normalized and explainable.
- No probabilistic dependency introduced.
- P2 dependencies satisfied.

Status: Completed.

### Phase 2 - Post-Commit Reviewer Layer
**Goal**: Reliable async scoring pipeline with retries, DLQ, and admin visibility.

ToPlan:
- State machine: `pending -> processing -> completed|failed -> dead_letter`.
- Lease/lock strategy and idempotent linkage (`auditLogId` uniqueness).
- Retry/backoff and DLQ policy.
- Admin endpoints for queue/failures/retry/feedback.

ToExecute:
- Implement worker flow: enqueue -> claim -> score -> persist.
- Enforce retry budget and dead-letter transitions.
- Implement admin visibility endpoints and pagination/filtering.
- Preserve non-blocking write path.

ToReview:
- Duplicate processing prevented.
- Retry/backoff bounded and observable.
- DLQ triage/re-drive works.
- Admin endpoints are least-privilege and actionable.

Status: Active (implemented core behavior).

### Phase 3 - Action Registry and Guardrails
**Goal**: Ensure actions are safe, controlled, and policy-enforced.

ToPlan:
- Registry schema and action ownership.
- Guardrail precedence model.

ToExecute:
- Registry-backed action evaluation.
- Blocked-action reasons and audit traces.

ToReview:
- No unregistered action execution.
- Guardrail precedence deterministic and test-covered.

Status: Foundation implemented.

### Phase 4 - AI Explanation Overlay
**Goal**: Add AI explanations without changing deterministic truth.

ToPlan:
- Clear deterministic vs AI separation contract.
- Divergence/confidence policy.

ToExecute:
- Persist AI advisory fields separately.
- Keep `final.*` deterministic-only.
- Add UI separation for operator trust.

ToReview:
- AI cannot mutate deterministic final score/level.
- Explanations are useful and safely bounded.

Status: Partial.

### Phase 5 - Feedback Calibration Engine
**Goal**: Learn from feedback while keeping bounded, reversible behavior.

ToPlan:
- Feedback taxonomy and calibration bounds.
- Rollback and governance rules.

ToExecute:
- Apply bounded offsets to rule weights.
- Store who changed what and why.
- Support safe rollback.

ToReview:
- Calibration remains bounded/reversible.
- Drift checks and safety criteria satisfied.

Status: Partial.

### Phase 6 - Metrics and Observability
**Goal**: Production-level health, drift, and rollback telemetry.

ToPlan:
- KPI catalog and alert thresholds.

ToExecute:
- Queue depth/failure/retry/latency metrics.
- Score/risk-level distributions and drift signals.
- Operational dashboards and alerts.

ToReview:
- SLO-aligned alerts.
- Clear rollback triggers.

Status: Partial.

---

## 9) Runtime Flow Contract (Current)

### Risk Queue Request/Response
Client request:
- `GET /api/admin/hub/risk-assessments`
- Query: `status, eventType, category, includeFailures, page, limit`

Server response:
- `{ assessments, page, limit, queueSummary, backfillTriggered, failures? }`
- Score remains single deterministic field: `assessments[*].final.score` (0-100).

### Scoring Path
1. `recordEvent()` writes audit log.
2. `scheduleAuditLogRiskProcessing()` enqueues async worker.
3. `processAuditLogRisk()` claims lease, scores deterministic, persists assessment.
4. On errors: retry with backoff; then `dead_letter` at max attempts.
5. Backfill scans recent audit logs and re-processes in batches.

---

## 10) Runtime Tracing (Diagnostics)
Use only during investigation.

Flags:
- `RISK_REVIEWER_TRACE=true`
- `ADMIN_HUB_RISK_TRACE=true`

Reviewer trace stages include:
- `audit_event_recorded`
- `schedule_enqueue`, `schedule_skip_disabled`, `schedule_execution_error`
- `process_start`
- `skip_terminal_status`, `skip_active_lease`, `skip_retry_pending`
- `claim_acquired`, `claim_not_acquired`
- `score_computed`
- `assessment_completed`, `assessment_error`
- `backfill_schedule_*`, `backfill_start`

AdminHub trace:
- Request filters/pagination + response counts/summary + `backfillTriggered`.

Triage sequence:
1. Trigger a known audit event.
2. Expect chain:
   - `audit_event_recorded -> schedule_enqueue -> process_start -> claim_acquired -> score_computed -> assessment_completed`
3. First missing stage identifies failure boundary.

---

## 11) Open Risks (Current)
- Silent async failures can be overlooked without trace enabled.
- Lease/retry tuning may require env-specific adjustments.
- Backfill timing can mask real-time processing regressions if not monitored.

---

## 12) Quick Agent Checklist
For any task in this refactor:
1. Confirm phase + dependency preconditions.
2. Produce `ToPlan` in your domain.
3. Implement `ToExecute` with tests/evidence.
4. Submit `ToReview` with signoff block.
5. If any material change occurs after approval, reopen gate.
