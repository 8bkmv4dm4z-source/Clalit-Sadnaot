/**
 * AI Risk Analysis Service — Multi-Provider (Groq / Ollama)
 *
 * Provider priority (configurable via RISK_AI_PROVIDER):
 *   "auto"   → try Ollama first (local, free), fall back to Groq
 *   "ollama" → Ollama only
 *   "groq"   → Groq only
 *
 * No paid API dependencies. Uses native fetch (Node 18+).
 *
 * Env vars:
 *   RISK_AI_PROVIDER        — "auto" | "groq" | "ollama" (default: "auto")
 *   GROQ_API_KEY            — required for Groq provider
 *   GROQ_RISK_MODEL         — default: "llama-3.3-70b-versatile"
 *   OLLAMA_BASE_URL         — default: "http://localhost:11434"
 *   OLLAMA_RISK_MODEL       — default: "llama3.2"
 *   RISK_AI_TIMEOUT_MS      — default: 8000
 *   RISK_AI_CACHE_TTL_MS    — default: 3600000 (1 hour)
 *   RISK_AI_CACHE_MAX       — default: 500
 */

const RISK_AI_TIMEOUT_MS = Number(process.env.RISK_AI_TIMEOUT_MS) || 8000;
const RISK_AI_CACHE_TTL_MS = Number(process.env.RISK_AI_CACHE_TTL_MS) || 3600000;
const RISK_AI_CACHE_MAX = Number(process.env.RISK_AI_CACHE_MAX) || 500;

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_RISK_MODEL || "llama-3.3-70b-versatile";
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_RISK_MODEL || "llama3.2";

const GROQ_RPM_LIMIT = Number(process.env.GROQ_RPM_LIMIT) || 28; // free tier is 30, keep 2 margin

const cache = new Map();

/* ─── Groq Rate Limiter (sliding window, per-minute) ─── */

const groqRequestLog = [];

const isGroqRateLimited = () => {
  const now = Date.now();
  const windowStart = now - 60_000;
  while (groqRequestLog.length && groqRequestLog[0] < windowStart) {
    groqRequestLog.shift();
  }
  return groqRequestLog.length >= GROQ_RPM_LIMIT;
};

const recordGroqRequest = () => {
  groqRequestLog.push(Date.now());
};

/* ─── Provider Detection & Ollama Health Probe ─── */

const OLLAMA_PROBE_TTL_MS = 5 * 60 * 1000; // cache probe result for 5 min
let ollamaProbeResult = { available: null, checkedAt: 0 };

const getProvider = () => String(process.env.RISK_AI_PROVIDER || "auto").toLowerCase();

const isGroqConfigured = () => {
  const key = process.env.GROQ_API_KEY;
  return Boolean(key && typeof key === "string" && key.trim().length > 0);
};

const probeOllama = async () => {
  const now = Date.now();
  if (ollamaProbeResult.available !== null && (now - ollamaProbeResult.checkedAt) < OLLAMA_PROBE_TTL_MS) {
    return ollamaProbeResult.available;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    const ok = res.ok;
    ollamaProbeResult = { available: ok, checkedAt: now };
    if (!ok) console.warn("[Risk AI] Ollama probe returned", res.status);
    return ok;
  } catch {
    ollamaProbeResult = { available: false, checkedAt: now };
    return false;
  }
};

const isOllamaProbeHealthy = () => {
  if (ollamaProbeResult.available === null) return true; // unknown — allow first attempt
  if ((Date.now() - ollamaProbeResult.checkedAt) >= OLLAMA_PROBE_TTL_MS) return true; // stale — allow retry
  return ollamaProbeResult.available;
};

const isAIAvailable = () => {
  const provider = getProvider();
  if (provider === "groq") return isGroqConfigured();
  if (provider === "ollama") return isOllamaProbeHealthy();
  // auto: need at least one provider that looks reachable
  return isOllamaProbeHealthy() || isGroqConfigured();
};

/* ─── Cache ─── */

const evictStaleCache = () => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > RISK_AI_CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
};

const enforceMaxCache = () => {
  if (cache.size <= RISK_AI_CACHE_MAX) return;
  let oldest = null;
  let oldestKey = null;
  for (const [key, entry] of cache) {
    if (!oldest || entry.createdAt < oldest) {
      oldest = entry.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
};

/* ─── Prompt (compact — fits within ~400 input tokens) ─── */

const SYSTEM_MESSAGE = `Security analyst for workshop platform. Respond JSON only: {"summary":"2-3 sentences","anomalyFlags":[{"flag":"","confidence":0.0-1.0,"reasoning":""}],"patternAnalysis":"","suggestedUrgency":"routine|elevated|urgent","confidenceNote":""}`;

const buildUserMessage = ({ deterministic, subjectProfile, eventContext, timingDeltas }) => {
  const top3 = (deterministic?.contributions || [])
    .slice(0, 3)
    .map((c) => `${c.label}:${c.score}`);

  const activePatterns = Object.entries(subjectProfile?.patterns || {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  return JSON.stringify({
    evt: eventContext?.eventType || "",
    sev: eventContext?.severity || "info",
    cat: eventContext?.category || "SECURITY",
    score: deterministic?.score || 0,
    level: deterministic?.riskLevel || "low",
    top: top3,
    total: subjectProfile?.totalEvents || 0,
    patterns: activePatterns,
    deltas: (timingDeltas || []).slice(0, 10),
  });
};

/* ─── Response Parsing ─── */

const parseResponse = (content) => {
  let text = String(content || "").trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const parsed = JSON.parse(text);
  return {
    summary: String(parsed.summary || "").slice(0, 1000),
    anomalyFlags: Array.isArray(parsed.anomalyFlags)
      ? parsed.anomalyFlags.slice(0, 10).map((f) => ({
          flag: String(f.flag || ""),
          confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)),
          reasoning: String(f.reasoning || "").slice(0, 500),
        }))
      : [],
    patternAnalysis: String(parsed.patternAnalysis || "").slice(0, 1000),
    suggestedUrgency: ["routine", "elevated", "urgent"].includes(parsed.suggestedUrgency)
      ? parsed.suggestedUrgency
      : "routine",
    confidenceNote: String(parsed.confidenceNote || "").slice(0, 500),
  };
};

/* ─── Provider Calls ─── */

const callGroq = async (messages) => {
  if (isGroqRateLimited()) {
    throw new Error("Groq rate limit reached (free tier), skipping");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RISK_AI_TIMEOUT_MS);

  try {
    recordGroqRequest();
    const res = await fetch(GROQ_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      throw new Error("Groq 429: rate limited by server");
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned empty content");
    return { content, model: GROQ_MODEL, provider: "groq" };
  } finally {
    clearTimeout(timeout);
  }
};

const callOllama = async (messages) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RISK_AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        format: "json",
        stream: false,
        options: { temperature: 0.3 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Ollama ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data?.message?.content;
    if (!content) throw new Error("Ollama returned empty content");
    return { content, model: OLLAMA_MODEL, provider: "ollama" };
  } finally {
    clearTimeout(timeout);
  }
};

/* ─── Main Analysis ─── */

const analyzeRiskEvent = async ({ deterministic, subjectProfile, eventContext, timingDeltas }) => {
  if (!isAIAvailable()) return null;

  const messages = [
    { role: "system", content: SYSTEM_MESSAGE },
    {
      role: "user",
      content: buildUserMessage({ deterministic, subjectProfile, eventContext, timingDeltas }),
    },
  ];

  const provider = getProvider();
  let raw = null;

  try {
    if (provider === "ollama") {
      const ollamaOk = await probeOllama();
      if (!ollamaOk) return null;
      raw = await callOllama(messages);
    } else if (provider === "groq") {
      if (!isGroqConfigured()) return null;
      raw = await callGroq(messages);
    } else {
      // auto: probe Ollama first, fall back to Groq
      const ollamaOk = await probeOllama();
      if (ollamaOk) {
        try {
          raw = await callOllama(messages);
        } catch (ollamaErr) {
          // mark probe as failed so future calls skip immediately
          ollamaProbeResult = { available: false, checkedAt: Date.now() };
          console.warn("[Risk AI] Ollama call failed, trying Groq:", ollamaErr?.message || ollamaErr);
          if (isGroqConfigured()) {
            raw = await callGroq(messages);
          } else {
            return null;
          }
        }
      } else if (isGroqConfigured()) {
        raw = await callGroq(messages);
      } else {
        return null;
      }
    }

    if (!raw?.content) return null;

    const result = parseResponse(raw.content);
    result.model = `${raw.provider}/${raw.model}`;
    return result;
  } catch (err) {
    console.warn("[Risk AI] analysis failed:", err?.message || err);
    return null;
  }
};

/* ─── Cache Layer ─── */

const getCachedOrAnalyze = async (cacheKey, analysisFn) => {
  evictStaleCache();

  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached.result, cached: true };
  }

  const result = await analysisFn();
  if (result) {
    enforceMaxCache();
    cache.set(cacheKey, { result, createdAt: Date.now() });
  }
  return result;
};

module.exports = {
  isOpenAIAvailable: isAIAvailable,
  analyzeRiskEvent,
  getCachedOrAnalyze,
};
