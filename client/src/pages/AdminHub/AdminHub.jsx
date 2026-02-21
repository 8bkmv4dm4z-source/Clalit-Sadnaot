import React, { useMemo, useState } from "react";
import { AdminHubProvider, useAdminHub } from "../../context/AdminHubContext";
import { groupLogsByCategory } from "../../utils/adminHubClient";
import SecurityInsightsPanel, { SeverityBadge } from "./SecurityInsightsPanel";

const TAB_CONFIG = {
  registrations: {
    label: "Registrations",
    category: "REGISTRATIONS",
  },
  security: {
    label: "Security",
    category: "SECURITY",
  },
  notices: {
    label: "Notices",
    category: "NOTICES",
  },
  insights: {
    label: "Insights",
    category: null,
  },
};

const TAB_KEYS = Object.keys(TAB_CONFIG);

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

const AdminHubContent = () => {
  const { logs } = useAdminHub();
  const [activeTab, setActiveTab] = useState("registrations");

  const filteredLogs = useMemo(() => {
    const category = TAB_CONFIG[activeTab]?.category;
    if (!category) return [];
    return logs.filter((log) => log?.category === category);
  }, [activeTab, logs]);

  const handleSelectTab = (tabKey) => {
    setActiveTab(tabKey);
  };

  const isInsightsTab = activeTab === "insights";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin Hub</p>
            <h1 className="text-lg font-semibold text-gray-800">Choose what you want to review</h1>
          </div>
          <AdminTabs activeTab={activeTab} onSelectTab={handleSelectTab} />
          {!isInsightsTab && (
            <p className="text-sm text-gray-600">Logs are shown per server-provided category only.</p>
          )}
        </div>
      </div>
      {isInsightsTab ? <SecurityInsightsPanel /> : <LogsTable filteredLogs={filteredLogs} />}
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
