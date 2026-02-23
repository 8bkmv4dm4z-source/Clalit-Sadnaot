import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHubProvider, useAdminHub } from "../../context/AdminHubContext";
import {
  groupLogsByCategory,
  retryRiskAssessment,
  submitRiskFeedback,
} from "../../utils/adminHubClient";
import { normalizeError } from "../../utils/normalizeError";
import SecurityInsightsPanel, { SeverityBadge } from "./SecurityInsightsPanel";

const TAB_CONFIG = {
  registrations: {
    label: "Registrations",
    categories: ["REGISTRATION", "WORKSHOP"],
  },
  security: {
    label: "Security",
    categories: ["SECURITY"],
  },
  notices: {
    label: "Notices",
    categories: ["CAPACITY", "HYGIENE"],
  },
  insights: {
    label: "Insights",
    categories: [],
  },
  riskQueue: {
    label: "Risk Queue",
    categories: [],
  },
};

const TAB_KEYS = Object.keys(TAB_CONFIG);
const RISK_QUEUE_STATUSES = ["pending", "processing", "failed", "dead_letter", "completed"];
const RETRYABLE_RISK_STATUSES = new Set(["failed", "dead_letter"]);
const RISK_STATUS_COPY = {
  pending: "Queued for deterministic processing",
  processing: "Deterministic processing in progress",
  failed: "Deterministic processing failed",
  dead_letter: "Deterministic processing exhausted — moved to dead-letter",
  completed: "Deterministic processing completed",
};

const Section = ({ title, children }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <h2 className="mb-3 text-lg font-semibold text-gray-800">{title}</h2>
    {children}
  </section>
);

const LogsTable = ({ filteredLogs }) => {
  const { loading, error } = useAdminHub();

  const grouped = useMemo(() => groupLogsByCategory(filteredLogs), [filteredLogs]);

  if (error) {
    return (
      <Section title="Audit events">
        <p className="text-sm text-red-600">{error}</p>
      </Section>
    );
  }

  return (
    <Section title="Audit events">
      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {!loading && filteredLogs.length === 0 && (
        <p className="text-sm text-gray-500">No events match the current filters.</p>
      )}
      <div className="space-y-4">
        {Object.entries(grouped).map(([designation, items]) => (
          <div key={designation} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{designation}</h3>
            <div className="divide-y divide-gray-200">
              {items.map((item, idx) => (
                <div key={`${item.eventType}-${idx}`} className="py-2 text-sm text-gray-800">
                  <div className="flex flex-wrap items-center gap-2 text-gray-700">
                    <span className="font-medium">{item.eventType}</span>
                    {item.severity && <SeverityBadge severity={item.severity} />}
                    <span className="text-gray-500">· {item.subjectType}</span>
                    <span className="text-gray-500">· {item.subjectKey}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                  </div>
                  {item.metadata && (
                    <pre className="mt-1 rounded bg-white/60 p-2 text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(item.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const AdminTabs = ({ activeTab, onSelectTab }) => (
  <div className="flex flex-wrap gap-3">
    {TAB_KEYS.map((key) => {
      const isActive = activeTab === key;
      return (
        <button
          key={key}
          onClick={() => onSelectTab(key)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            isActive ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700"
          }`}
        >
          <span>{TAB_CONFIG[key].label}</span>
        </button>
      );
    })}
  </div>
);

const RiskQueueStatusBadge = ({ status }) => {
  const toneByStatus = {
    pending: "border-yellow-200 bg-yellow-50 text-yellow-700",
    processing: "border-blue-200 bg-blue-50 text-blue-700",
    failed: "border-red-200 bg-red-50 text-red-700",
    dead_letter: "border-red-200 bg-red-50 text-red-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  const tone = toneByStatus[status] || "border-gray-200 bg-gray-50 text-gray-700";
  const label = String(status || "unknown").replaceAll("_", " ");
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
};

const resolveAssessmentId = (assessment) => {
  if (!assessment || typeof assessment !== "object") return "";
  return String(assessment.assessmentId || assessment.id || assessment._id || assessment.auditLogId || "").trim();
};

const resolveRiskStatusCopy = (status) => RISK_STATUS_COPY[status] || "Status unavailable";

const FEEDBACK_TYPE_OPTIONS = [
  { value: "", label: "Select feedback type" },
  { value: "false_positive", label: "False positive" },
  { value: "true_positive", label: "True positive" },
  { value: "escalate", label: "Escalate" },
  { value: "downgrade", label: "Downgrade" },
  { value: "accepted_action", label: "Accepted action" },
  { value: "rejected_action", label: "Rejected action" },
];

const ACTION_FEEDBACK_TYPES = new Set(["accepted_action", "rejected_action"]);

const RiskFeedbackForm = ({ assessmentId, adminPassword, suggestedActions, onSuccess }) => {
  const [expanded, setExpanded] = useState(false);
  const [feedbackType, setFeedbackType] = useState("");
  const [notes, setNotes] = useState("");
  const [actionId, setActionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const showActionSelect = ACTION_FEEDBACK_TYPES.has(feedbackType) && suggestedActions.length > 0;

  const handleSubmit = async () => {
    if (!feedbackType) return;
    setSubmitting(true);
    setFeedback("");
    try {
      const payload = { feedbackType };
      if (notes.trim()) payload.notes = notes.trim();
      if (showActionSelect && actionId) payload.actionId = actionId;
      const result = await submitRiskFeedback({ adminPassword, assessmentId, payload });
      if (!result.ok) {
        const normalized = normalizeError(null, {
          status: result.status,
          payload: result.body,
          fallbackMessage: `Feedback submission failed (${result.status})`,
        });
        setFeedback(normalized.message);
        return;
      }
      setFeedback("Feedback submitted successfully.");
      setFeedbackType("");
      setNotes("");
      setActionId("");
      setExpanded(false);
      onSuccess();
    } catch (err) {
      const normalized = normalizeError(err, { fallbackMessage: "Failed to submit feedback" });
      setFeedback(normalized.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setExpanded(false);
    setFeedbackType("");
    setNotes("");
    setActionId("");
    setFeedback("");
  };

  if (!expanded) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          Feedback
        </button>
        {feedback && <p className="text-xs text-gray-600">{feedback}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">Submit feedback</p>
      <select
        value={feedbackType}
        onChange={(e) => setFeedbackType(e.target.value)}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
      >
        {FEEDBACK_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {showActionSelect && (
        <select
          value={actionId}
          onChange={(e) => setActionId(e.target.value)}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
        >
          <option value="">Select action</option>
          {suggestedActions.map((action, aIdx) => (
            <option key={action.actionId || aIdx} value={action.actionId}>
              {action.actionId} — {action.reason || "no reason"}
            </option>
          ))}
        </select>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={200}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 resize-none"
      />
      {feedback && <p className="text-xs text-red-600">{feedback}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!feedbackType || submitting}
          onClick={handleSubmit}
          className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="rounded border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const RISK_LEVEL_TONES = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-yellow-200 bg-yellow-50 text-yellow-700",
  medium: "border-orange-200 bg-orange-50 text-orange-700",
  high: "border-red-200 bg-red-50 text-red-700",
  immediate: "border-red-300 bg-red-100 text-red-800",
};

const RiskQueueMetrics = ({ assessments, queueSummary }) => {
  const queueHealth = useMemo(() => {
    const total = RISK_QUEUE_STATUSES.reduce((sum, s) => sum + (queueSummary[s] || 0), 0);
    const active = (queueSummary.pending || 0) + (queueSummary.processing || 0);
    const failures = (queueSummary.failed || 0) + (queueSummary.dead_letter || 0);
    const failureRate = total > 0 ? ((failures / total) * 100).toFixed(1) : "0.0";
    return { total, active, failureRate };
  }, [queueSummary]);

  const riskDistribution = useMemo(() => {
    const counts = {};
    for (const a of assessments) {
      const level = a?.final?.riskLevel;
      if (level) counts[level] = (counts[level] || 0) + 1;
    }
    return counts;
  }, [assessments]);

  const scoreStats = useMemo(() => {
    if (assessments.length === 0) return null;
    const scores = assessments.map((a) => a?.final?.score).filter((s) => typeof s === "number");
    if (scores.length === 0) return null;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const avg = (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1);
    return { min, max, avg };
  }, [assessments]);

  const calibration = useMemo(() => {
    let calibrated = 0;
    let driftDetected = false;
    for (const a of assessments) {
      if (a?.calibration?.profileVersion > 1) calibrated += 1;
      if (a?.aiOverlay?.guardrails?.divergenceExceeded === true) driftDetected = true;
    }
    return { calibrated, driftDetected };
  }, [assessments]);

  const avgLatency = useMemo(() => {
    const completed = assessments.filter(
      (a) => a?.processing?.status === "completed" && a?.processing?.processedAt && a?.createdAt,
    );
    if (completed.length === 0) return null;
    const totalMs = completed.reduce((sum, a) => {
      return sum + (new Date(a.processing.processedAt).getTime() - new Date(a.createdAt).getTime());
    }, 0);
    return (totalMs / completed.length / 1000).toFixed(1);
  }, [assessments]);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Queue metrics</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-gray-500">Queue health</p>
          <p className="text-sm font-semibold text-gray-900">{queueHealth.total} total</p>
          <p className="text-xs text-gray-600">{queueHealth.active} active</p>
          <p className="text-xs text-gray-600">{queueHealth.failureRate}% failure rate</p>
        </div>

        <div>
          <p className="text-xs text-gray-500">Risk distribution</p>
          {Object.keys(riskDistribution).length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(riskDistribution).map(([level, count]) => (
                <span
                  key={level}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${RISK_LEVEL_TONES[level] || "border-gray-200 bg-gray-50 text-gray-700"}`}
                >
                  {level}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500">Score stats</p>
          {scoreStats ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Avg: {scoreStats.avg}</p>
              <p className="text-xs text-gray-600">
                Min: {scoreStats.min} / Max: {scoreStats.max}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No scores</p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500">Calibration / Latency</p>
          <p className="text-xs text-gray-600">{calibration.calibrated} calibrated</p>
          {calibration.driftDetected && (
            <p className="text-xs font-medium text-amber-700">Drift warning: divergence exceeded</p>
          )}
          <p className="text-xs text-gray-600">Avg latency: {avgLatency !== null ? `${avgLatency}s` : "N/A"}</p>
        </div>
      </div>
    </div>
  );
};

const RiskQueuePanel = () => {
  const {
    adminPassword,
    riskAssessments,
    riskFailures,
    riskQueueSummary,
    riskQueueLoading,
    riskQueueError,
    riskQueueSyncing,
    riskQueueLastUpdatedAt,
    refreshRiskQueue,
  } = useAdminHub();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [retryingId, setRetryingId] = useState("");
  const [retryStatus, setRetryStatus] = useState("");

  const loadQueuePage = useCallback(async () => {
    if (!adminPassword) return;
    await refreshRiskQueue({ page, limit });
  }, [adminPassword, limit, page, refreshRiskQueue]);

  useEffect(() => {
    loadQueuePage();
  }, [loadQueuePage]);

  useEffect(() => {
    if (!adminPassword) return undefined;
    const timer = setInterval(() => {
      refreshRiskQueue({ page, limit });
    }, 30000);
    return () => clearInterval(timer);
  }, [adminPassword, limit, page, refreshRiskQueue]);

  const handleRetry = async (assessment) => {
    const assessmentId = resolveAssessmentId(assessment);
    if (!assessmentId) {
      setRetryStatus("Retry unavailable: missing assessment identifier.");
      return;
    }
    setRetryingId(assessmentId);
    setRetryStatus("");
    try {
      const result = await retryRiskAssessment({ adminPassword, assessmentId });
      if (!result.ok) {
        const normalized = normalizeError(null, {
          status: result.status,
          payload: result.body,
          fallbackMessage: `Retry request failed (${result.status})`,
        });
        setRetryStatus(normalized.message);
        return;
      }
      const nextStatus = result.body?.assessment?.processing?.status;
      setRetryStatus(`Retry requested. ${resolveRiskStatusCopy(nextStatus)}.`);
      await loadQueuePage();
    } catch (err) {
      const normalized = normalizeError(err, { fallbackMessage: "Failed to retry assessment" });
      setRetryStatus(normalized.message);
    } finally {
      setRetryingId("");
    }
  };

  const canGoNext = riskAssessments.length >= limit;
  const canGoPrev = page > 1;

  return (
    <Section title="Risk queue">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {RISK_QUEUE_STATUSES.map((status) => (
            <div key={status} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{status.replaceAll("_", " ")}</p>
              <p className="text-xl font-semibold text-gray-900">{riskQueueSummary[status] || 0}</p>
              <p className="text-xs text-gray-600">{resolveRiskStatusCopy(status)}</p>
            </div>
          ))}
        </div>

        <RiskQueueMetrics assessments={riskAssessments} queueSummary={riskQueueSummary} />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-sm text-gray-700">Page {page}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={!canGoPrev || riskQueueLoading}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!canGoNext || riskQueueLoading}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {retryStatus && <p className="text-sm text-gray-700">{retryStatus}</p>}
        {riskQueueError && <p className="text-sm text-red-600">{riskQueueError}</p>}
        {riskQueueLoading && <p className="text-sm text-gray-600">Loading risk queue…</p>}
        {!riskQueueLoading && riskQueueSyncing && (
          <p className="text-sm text-amber-700">
            Risk queue sync is running from historical audit events. Counts may remain zero until processing completes.
          </p>
        )}
        {riskQueueLastUpdatedAt && (
          <p className="text-xs text-gray-500">
            Last updated: {new Date(riskQueueLastUpdatedAt).toLocaleTimeString()}
          </p>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Assessments</h3>
          {riskAssessments.length === 0 && !riskQueueLoading && !riskQueueSyncing && (
            <p className="text-sm text-gray-500">No risk assessments found for this page.</p>
          )}
          {riskAssessments.map((assessment, idx) => {
            const status = assessment?.processing?.status;
            const assessmentId = resolveAssessmentId(assessment);
            const retryable = RETRYABLE_RISK_STATUSES.has(status) && !!assessmentId;
            const isRetrying = retryingId && retryingId === assessmentId;
            return (
              <div
                key={`${assessmentId || assessment?.eventType || "assessment"}-${idx}`}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{assessment?.eventType || "unknown.event"}</span>
                    <RiskQueueStatusBadge status={status} />
                    <span className="text-xs text-gray-500">{resolveRiskStatusCopy(status)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!retryable || !!isRetrying}
                    onClick={() => handleRetry(assessment)}
                    className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRetrying ? "Retrying…" : "Retry"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>Category: {assessment?.category || "—"}</span>
                  <span>Subject: {assessment?.subjectType || "—"} / {assessment?.subjectKey || "—"}</span>
                  <span>Risk: {assessment?.final?.riskLevel || "—"} ({assessment?.final?.score ?? "—"})</span>
                  <span>Attempts: {assessment?.processing?.attempts ?? 0}</span>
                  <span>Factors: {Array.isArray(assessment?.deterministic?.contributions) ? assessment.deterministic.contributions.length : 0}</span>
                </div>
                {assessment?.sourceMetadata?.context && (
                  <p className="mt-2 text-xs text-gray-700">
                    Source: {assessment.sourceMetadata.context}
                  </p>
                )}
                {assessment?.sourceMetadata?.guardViolation && (
                  <p className="mt-1 text-xs text-gray-700">
                    Guard: {assessment.sourceMetadata.guardViolation}
                  </p>
                )}
                {Array.isArray(assessment?.sourceMetadata?.strippedFields) &&
                  assessment.sourceMetadata.strippedFields.length > 0 && (
                    <p className="mt-1 text-xs text-gray-700">
                      Stripped: {assessment.sourceMetadata.strippedFields.join(", ")}
                    </p>
                  )}
                {Array.isArray(assessment?.processing?.logs) && assessment.processing.logs.length > 0 && (
                  <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
                    <p className="text-xs font-semibold text-gray-700">Server processing log</p>
                    <div className="mt-1 space-y-1">
                      {assessment.processing.logs.slice(-5).map((entry, logIdx) => (
                        <p key={`${assessmentId || "assessment"}-log-${logIdx}`} className="text-xs text-gray-700">
                          [{entry?.stage || "stage"}] {entry?.message || "no message"}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {assessment.aiOverlay?.enabled ? (
                  <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      AI Advisory (non-authoritative)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                      <span className="font-medium">Deterministic (source of truth): {assessment.deterministic?.score ?? "—"}</span>
                      <span>|</span>
                      <span>AI Advisory: {assessment.aiOverlay.advisoryScore ?? "—"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span>
                        Divergence:{" "}
                        <span
                          className={
                            (assessment.aiOverlay.divergenceScore ?? 0) > 25
                              ? "font-medium text-red-600"
                              : (assessment.aiOverlay.divergenceScore ?? 0) >= 10
                                ? "font-medium text-amber-600"
                                : "font-medium text-emerald-600"
                          }
                        >
                          {assessment.aiOverlay.divergenceScore ?? "—"}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="flex items-center gap-2 text-xs text-gray-700">
                        <span>Confidence: {assessment.aiOverlay.confidence != null ? `${Math.round(assessment.aiOverlay.confidence * 100)}%` : "—"}</span>
                      </div>
                      {assessment.aiOverlay.confidence != null && (
                        <div className="mt-0.5 h-1.5 w-full max-w-xs rounded-full bg-gray-200">
                          <div
                            className={`h-1.5 rounded-full ${
                              assessment.aiOverlay.confidence >= 0.7
                                ? "bg-emerald-500"
                                : assessment.aiOverlay.confidence >= 0.4
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${Math.round(assessment.aiOverlay.confidence * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {assessment.aiOverlay.summary && (
                      <p className="mt-2 text-xs text-gray-600">{assessment.aiOverlay.summary}</p>
                    )}
                    {Array.isArray(assessment.aiOverlay.suggestedActions) && assessment.aiOverlay.suggestedActions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-600">Suggested actions</p>
                        <ul className="mt-1 space-y-0.5">
                          {assessment.aiOverlay.suggestedActions.map((action, aIdx) => (
                            <li key={`${assessmentId}-suggested-${aIdx}`} className="text-xs text-gray-700">
                              <span className="font-medium">{action.actionId}</span> — {action.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(assessment.aiOverlay.blockedActions) && assessment.aiOverlay.blockedActions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-600">Blocked actions</p>
                        <ul className="mt-1 space-y-0.5">
                          {assessment.aiOverlay.blockedActions.map((action, bIdx) => (
                            <li key={`${assessmentId}-blocked-${bIdx}`} className="text-xs text-red-700">
                              <span className="font-medium">{action.actionId}</span> — {action.blockedReason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {assessment.aiOverlay.guardrails && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {assessment.aiOverlay.guardrails.confidenceGateBlocked && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            confidence gate blocked
                          </span>
                        )}
                        {assessment.aiOverlay.guardrails.divergenceExceeded && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            divergence exceeded
                          </span>
                        )}
                        {assessment.aiOverlay.guardrails.shadowMode && (
                          <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            shadow mode
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">AI advisory: disabled</p>
                )}
                <RiskFeedbackForm
                  assessmentId={assessmentId}
                  adminPassword={adminPassword}
                  suggestedActions={assessment?.aiOverlay?.suggestedActions || []}
                  onSuccess={loadQueuePage}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Failures</h3>
          {riskFailures.length === 0 && !riskQueueLoading && <p className="text-sm text-gray-500">No failed assessments on this page.</p>}
          {riskFailures.map((failure, idx) => (
            <div
              key={`${resolveAssessmentId(failure) || failure?.eventType || "failure"}-${idx}`}
              className="rounded-lg border border-red-100 bg-red-50/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{failure?.eventType || "unknown.event"}</span>
                <RiskQueueStatusBadge status={failure?.processing?.status} />
                <span className="text-xs text-gray-600">{resolveRiskStatusCopy(failure?.processing?.status)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-700">
                {failure?.processing?.lastError || failure?.processing?.deadLetterReason || "No error details provided"}
              </p>
              {failure?.sourceMetadata?.context && (
                <p className="mt-1 text-xs text-gray-700">
                  Source: {failure.sourceMetadata.context}
                </p>
              )}
              {Array.isArray(failure?.sourceMetadata?.strippedFields) &&
                failure.sourceMetadata.strippedFields.length > 0 && (
                  <p className="mt-1 text-xs text-gray-700">
                    Stripped: {failure.sourceMetadata.strippedFields.join(", ")}
                  </p>
                )}
              {Array.isArray(failure?.processing?.logs) && failure.processing.logs.length > 0 && (
                <div className="mt-2 rounded border border-red-100 bg-white p-2">
                  <p className="text-xs font-semibold text-gray-700">Server processing log</p>
                  <div className="mt-1 space-y-1">
                    {failure.processing.logs.slice(-5).map((entry, logIdx) => (
                      <p key={`${resolveAssessmentId(failure) || "failure"}-log-${logIdx}`} className="text-xs text-gray-700">
                        [{entry?.stage || "stage"}] {entry?.message || "no message"}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};

const AdminHubContent = () => {
  const { logs } = useAdminHub();
  const [activeTab, setActiveTab] = useState("registrations");

  const filteredLogs = useMemo(() => {
    const categories = TAB_CONFIG[activeTab]?.categories || [];
    if (!categories.length) return [];
    return logs.filter((log) => categories.includes(log?.category));
  }, [activeTab, logs]);

  const handleSelectTab = (tabKey) => {
    setActiveTab(tabKey);
  };

  const isInsightsTab = activeTab === "insights";
  const isRiskQueueTab = activeTab === "riskQueue";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin Hub</p>
            <h1 className="text-lg font-semibold text-gray-800">Choose what you want to review</h1>
          </div>
          <AdminTabs activeTab={activeTab} onSelectTab={handleSelectTab} />
          {!isInsightsTab && !isRiskQueueTab && (
            <p className="text-sm text-gray-600">Logs are shown per server-provided category only.</p>
          )}
        </div>
      </div>
      {isInsightsTab ? (
        <SecurityInsightsPanel />
      ) : isRiskQueueTab ? (
        <RiskQueuePanel />
      ) : (
        <LogsTable filteredLogs={filteredLogs} />
      )}
    </div>
  );
};

const AdminHubGate = ({ onUnlock }) => {
  const { setAdminPassword } = useAdminHub();
  const [promptOpen, setPromptOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!password.trim()) {
      setError("Please provide the admin password.");
      return;
    }
    setAdminPassword(password.trim());
    setPromptOpen(false);
    setError("");
    onUnlock();
  };

  const handleCancel = () => {
    setPromptOpen(false);
    setPassword("");
    setError("");
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Secure access</h1>
        <p className="mt-1 text-sm text-gray-600">
          Open the Admin Hub with your in-memory admin password. Nothing is stored beyond this session.
        </p>
      </div>
      {!promptOpen && (
        <button
          onClick={() => setPromptOpen(true)}
          className="mx-auto w-full max-w-sm rounded-lg bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
        >
          Open Admin Hub
        </button>
      )}
      {promptOpen && (
        <form className="mx-auto flex w-full max-w-sm flex-col gap-3 text-left" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Admin password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
              placeholder="Enter admin password"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
            >
              Unlock
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default function AdminHub() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <AdminHubProvider>
      {unlocked ? <AdminHubContent /> : <AdminHubGate onUnlock={() => setUnlocked(true)} />}
    </AdminHubProvider>
  );
}
