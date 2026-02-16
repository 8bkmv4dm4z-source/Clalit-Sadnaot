import React from "react";
import { useAdminHub } from "../../context/AdminHubContext";

const SEVERITY_STYLES = {
  info: "bg-blue-100 text-blue-800",
  warn: "bg-yellow-100 text-yellow-800",
  critical: "bg-red-100 text-red-800",
};

const SeverityBadge = ({ severity }) => {
  const style = SEVERITY_STYLES[severity] || "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {severity}
    </span>
  );
};

const StatCard = ({ label, value, variant }) => {
  const borderColor =
    variant === "critical"
      ? "border-red-300"
      : variant === "warn"
        ? "border-yellow-300"
        : "border-gray-200";

  return (
    <div className={`rounded-lg border ${borderColor} bg-white p-4 shadow-sm`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800">{value ?? "—"}</p>
    </div>
  );
};

const SecurityInsightsPanel = () => {
  const { stats, statsLoading, statsError, refreshStats } = useAdminHub();

  if (statsLoading) {
    return <p className="text-sm text-gray-600">Loading security insights...</p>;
  }

  if (statsError) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <p className="text-sm text-red-600">{statsError}</p>
        <button
          onClick={() => refreshStats()}
          className="mt-2 rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">No security insight data available yet.</p>
      </div>
    );
  }

  const hourlyMetrics = stats.hourly?.metrics || {};
  const dailyMetrics = stats.daily?.metrics || {};
  const warnings = stats.warnings || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Events / hour" value={hourlyMetrics.totalEvents || 0} />
        <StatCard label="Events / day" value={dailyMetrics.totalEvents || 0} />
        <StatCard
          label="Critical (24h)"
          value={dailyMetrics.bySeverity?.critical || 0}
          variant={dailyMetrics.bySeverity?.critical > 0 ? "critical" : undefined}
        />
        <StatCard
          label="Warnings (24h)"
          value={dailyMetrics.bySeverity?.warn || 0}
          variant={dailyMetrics.bySeverity?.warn > 0 ? "warn" : undefined}
        />
      </div>

      {Object.keys(dailyMetrics.byEventType || {}).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Event breakdown (24h)</h3>
          <div className="divide-y divide-gray-100">
            {Object.entries(dailyMetrics.byEventType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div key={type} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-700">{type}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-red-700">Active warnings</h3>
          <div className="space-y-2">
            {warnings.map((w, idx) => (
              <div
                key={`${w.code}-${idx}`}
                className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2"
              >
                <SeverityBadge severity={w.severity} />
                <div className="text-sm text-gray-800">
                  <span className="font-medium">{w.code}</span>
                  <span className="mx-1">—</span>
                  <span>{w.message}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    ({w.value}/{w.threshold})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-700">No active warnings. All thresholds within limits.</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => refreshStats()}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};

export { SeverityBadge };
export default SecurityInsightsPanel;
