# Metrics & Calibration Agent Memory

## Key Architecture Facts

### Score Contract (Phase 1 — frozen v1.0.0)
- `DeterministicRiskEngine.js` outputs `score` clamped 0-100 via `clamp(Math.round(rawScore), 0, 100)`.
- Risk levels: `low`(<25), `warn`(25-49), `medium`(50-74), `high`(75-89), `immediate`(>=90).
- Each contribution has shape: `{ruleId, label, category, baseScore, calibrationOffset, score, reason}`.
- `calibrationOffset` clamped to [-20, +20] via `readCalibrationOffset`.

### Schema Fields for Metrics Queries
- `deterministic.score`: Number, min:0, max:100 — use for histogram and mean/median/p95.
- `deterministic.contributions`: Array of RiskContributionSchema — unwind for per-rule calibrationOffset spread.
- `final.riskLevel`: String, required — group by for risk-level mix ratio.
- `calibration.appliedRuleWeights`: Object — snapshot of weights used per assessment.

### Baseline Drift Thresholds (Phase 1 ToPlan, lines 203-204 AdminHubRefactor.md)
- Warning: 15% mix deviation OR 10pt mean shift over 7 days.
- Critical: 30% mix deviation OR 20pt mean shift over 7 days.
- Per-rule weight drift >15pt from initial = critical.

## File Paths
- Engine: `server/services/risk/DeterministicRiskEngine.js`
- Schema: `server/models/RiskAssessment.js`
- Playbook: `AdminHubRefactor.md` (Metrics ToExecute: lines ~239-247, ToPlan: lines ~200-204)
