const DEFAULT_FALLBACK_MESSAGE = "Something went wrong. Please try again.";
const MAX_MESSAGE_LENGTH = 180;

const SAFE_MESSAGES = new Set([
  "Workshop is full",
  "Already registered",
  "Request already in progress",
  "High traffic, try again",
  "Workshop not found",
  "Entity not found",
  "Entity already registered",
  "Entity already in waiting list",
  "Waiting list is full",
  "Unable to register entity",
  "Unable to add to waiting list",
]);

type ErrorKind = "Network" | "Auth" | "Forbidden" | "NotFound" | "Conflict" | "Validation" | "Server" | "Unknown";

const STATUS_KIND_MAP: Array<{ match: (status: number) => boolean; kind: ErrorKind }> = [
  { match: (status) => status === 401, kind: "Auth" },
  { match: (status) => status === 403, kind: "Forbidden" },
  { match: (status) => status === 404, kind: "NotFound" },
  { match: (status) => status === 409, kind: "Conflict" },
  { match: (status) => status === 429, kind: "Conflict" },
  { match: (status) => status === 400 || status === 422, kind: "Validation" },
  { match: (status) => typeof status === "number" && status >= 500, kind: "Server" },
];

const KIND_MESSAGES: Record<ErrorKind, string> = {
  Network: "Network error. Please check your connection and try again.",
  Auth: "Your session has expired. Please sign in again.",
  Forbidden: "You do not have permission to perform this action.",
  NotFound: "The requested resource was not found.",
  Conflict: "Request conflict. Please try again.",
  Validation: "Please check your input and try again.",
  Server: "Server error. Please try again later.",
  Unknown: DEFAULT_FALLBACK_MESSAGE,
};

const isProduction = (): boolean => import.meta.env.MODE === "production";

const sanitizeMessage = (value: unknown): string => {
  if (typeof value !== "string") return "";
  let message = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!message) return "";
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH).trim();
  }
  return message;
};

const extractPayloadMessage = (payload: any): string => {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (Array.isArray(payload.errors) && payload.errors.length) {
    const first = payload.errors[0];
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  return "";
};

const resolveKind = (status: number | null, isNetwork: boolean): ErrorKind => {
  if (isNetwork) return "Network";
  if (status !== null) {
    for (const rule of STATUS_KIND_MAP) {
      if (rule.match(status)) return rule.kind;
    }
  }
  return "Unknown";
};

const isRetryableKind = (kind: ErrorKind): boolean => ["Network", "Conflict", "Server"].includes(kind);

export interface NormalizedError {
  kind: ErrorKind;
  status: number | null;
  code: string | null;
  message: string;
  debugId: string | null;
  retryable: boolean;
  raw: null;
}

interface NormalizeErrorOptions {
  status?: number;
  payload?: any;
  fallbackMessage?: string;
}

export function normalizeError(error: any, { status, payload, fallbackMessage }: NormalizeErrorOptions = {}): NormalizedError {
  const axiosStatus = error?.response?.status;
  const resolvedStatus: number | null = status ?? axiosStatus ?? error?.status ?? null;
  const resolvedPayload = payload ?? error?.response?.data ?? null;
  const rawMessage = extractPayloadMessage(resolvedPayload) || error?.message || "";
  const sanitized = sanitizeMessage(rawMessage);

  const isNetwork =
    error?.name === "AbortError" ||
    error?.code === "ECONNABORTED" ||
    (error?.name === "TypeError" && error?.message?.includes("fetch"));

  const kind = resolveKind(resolvedStatus, isNetwork);
  const debugId: string | null =
    resolvedPayload?.debugId ||
    resolvedPayload?.requestId ||
    resolvedPayload?.correlationId ||
    null;
  const code: string | null = typeof resolvedPayload?.code === "string" ? resolvedPayload.code : null;

  const safeFallback = fallbackMessage || KIND_MESSAGES[kind] || DEFAULT_FALLBACK_MESSAGE;
  const isSafeAllowlist = SAFE_MESSAGES.has(sanitized);
  const message =
    sanitized && (!isProduction() || isSafeAllowlist)
      ? sanitized
      : safeFallback;

  return {
    kind,
    status: resolvedStatus ?? null,
    code,
    message: message || safeFallback,
    debugId,
    retryable: isRetryableKind(kind),
    raw: null,
  };
}
