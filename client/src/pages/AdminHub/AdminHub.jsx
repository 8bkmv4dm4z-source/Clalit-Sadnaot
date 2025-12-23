import React, { useMemo } from "react";
import { AdminHubProvider, useAdminHub } from "../../context/AdminHubContext";
import { groupLogsByCategory } from "../../utils/adminHubClient";

const EVENT_TYPES = [
  "",
  "security",
  "user.registered",
  "workshop.registration",
  "workshop.unregister",
  "workshop.waitlist.add",
  "workshop.waitlist.promoted",
  "workshop.maxed",
  "user.stale.detected",
];

const SUBJECT_TYPES = ["", "user", "familyMember", "workshop"];

const Section = ({ title, children }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <h2 className="mb-3 text-lg font-semibold text-gray-800">{title}</h2>
    {children}
  </section>
);

const Filters = () => {
  const { adminPassword, setAdminPassword, filters, setFilters, refreshLogs } = useAdminHub();

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Section title="Filters">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Admin password (in-memory only)
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
            placeholder="Required for Admin Hub"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Event type
          <select
            value={filters.eventType}
            onChange={(e) => updateFilter("eventType", e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
          >
            {EVENT_TYPES.map((v) => (
              <option key={v || "any"} value={v}>
                {v || "Any"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Subject type
          <select
            value={filters.subjectType}
            onChange={(e) => updateFilter("subjectType", e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
          >
            {SUBJECT_TYPES.map((v) => (
              <option key={v || "any"} value={v}>
                {v || "Any"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Subject key
          <input
            type="text"
            value={filters.subjectKey}
            onChange={(e) => updateFilter("subjectKey", e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
            placeholder="entityKey"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          From (ISO date)
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          To (ISO date)
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-gray-900"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => refreshLogs({ page: 1 })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
        >
          Apply filters
        </button>
        <p className="text-xs text-gray-500">
          Password is held only in memory and cleared on refresh. Do not store it in the browser.
        </p>
      </div>
    </Section>
  );
};

const LogsTable = () => {
  const { logs, loading, error, filters, setFilters } = useAdminHub();

  const grouped = useMemo(() => groupLogsByCategory(logs), [logs]);

  const changePage = (delta) => {
    setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) + delta) }));
  };

  if (error) {
    return (
      <Section title="Audit events">
        <p className="text-sm text-red-600">{error}</p>
      </Section>
    );
  }

  return (
    <Section title="Audit events">
      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>Page {filters.page || 1}</span>
        <div className="flex gap-2">
          <button
            onClick={() => changePage(-1)}
            className="rounded border border-gray-200 px-3 py-1 text-gray-700 hover:bg-gray-50"
            disabled={(filters.page || 1) <= 1}
          >
            Prev
          </button>
          <button
            onClick={() => changePage(1)}
            className="rounded border border-gray-200 px-3 py-1 text-gray-700 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {!loading && logs.length === 0 && (
        <p className="text-sm text-gray-500">No events match the current filters.</p>
      )}
      <div className="space-y-4">
        {Object.entries(grouped).map(([designation, items]) => (
          <div key={designation} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{designation}</h3>
            <div className="divide-y divide-gray-200">
              {items.map((item, idx) => (
                <div key={`${item.eventType}-${idx}`} className="py-2 text-sm text-gray-800">
                  <div className="flex flex-wrap gap-2 text-gray-700">
                    <span className="font-medium">{item.eventType}</span>
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

const AlertsPanel = () => {
  const { alerts, staleUsers } = useAdminHub();
  return (
    <Section title="Capacity & Hygiene">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Maxed workshops</h3>
          {alerts.length === 0 && <p className="text-xs text-gray-500">No alerts.</p>}
          <ul className="space-y-1">
            {alerts.map((a, idx) => (
              <li key={`${a.workshopId}-${idx}`} className="text-sm text-gray-800">
                <span className="font-medium">{a.title}</span> · {a.participantsCount}/
                {a.maxParticipants} ({a.workshopId})
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Stale users</h3>
          {staleUsers.length === 0 && <p className="text-xs text-gray-500">No stale users.</p>}
          <ul className="space-y-1">
            {staleUsers.map((u, idx) => (
              <li key={`${u.entityKey}-${idx}`} className="text-sm text-gray-800">
                <span className="font-medium">{u.name || "User"}</span> · {u.entityKey}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
};

const AdminHubContent = () => (
  <div className="mx-auto flex max-w-6xl flex-col gap-4">
    <Filters />
    <AlertsPanel />
    <LogsTable />
  </div>
);

export default function AdminHub() {
  return (
    <AdminHubProvider>
      <AdminHubContent />
    </AdminHubProvider>
  );
}
