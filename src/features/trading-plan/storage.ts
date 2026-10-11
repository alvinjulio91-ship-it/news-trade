export const TRADING_PLAN_STORAGE_KEY = "xau_news_ai_trading_plan";

export function tradingPlanStorageKey(userId?: string | null): string {
  return userId ? TRADING_PLAN_STORAGE_KEY + ":" + userId : TRADING_PLAN_STORAGE_KEY;
}

export type RecordType = "profit" | "loss";

export interface TradingRecord {
  id: string;
  date: string;
  type: RecordType;
  amount: number;
  note: string;
}

export interface MonthPlan {
  target: number;
  review: string;
  records: TradingRecord[];
}

export interface TradingPlanState {
  version: 1;
  selectedMonth: string;
  months: Record<string, MonthPlan>;
}

export type StorageStatus = "available" | "unavailable" | "invalid";

export interface ReadResult {
  state: TradingPlanState;
  status: StorageStatus;
}

export function currentMonthKey(date = new Date()): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

export function isMonthKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 9999;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1, 12));
}

export function emptyMonth(): MonthPlan {
  return { target: 0, review: "", records: [] };
}

export function emptyState(selectedMonth = currentMonthKey()): TradingPlanState {
  return { version: 1, selectedMonth, months: {} };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateTradingPlanState(value: unknown): TradingPlanState | null {
  if (!isPlainObject(value) || value.version !== 1 || !isMonthKey(value.selectedMonth) || !isPlainObject(value.months)) return null;

  const months: Record<string, MonthPlan> = {};
  for (const [monthKey, rawMonth] of Object.entries(value.months)) {
    if (!isMonthKey(monthKey) || !isPlainObject(rawMonth)) return null;
    const target = rawMonth.target;
    const review = rawMonth.review;
    const records = rawMonth.records;
    if (typeof target !== "number" || !Number.isFinite(target) || target < 0) return null;
    if (typeof review !== "string" || !Array.isArray(records)) return null;

    const seenIds = new Set<string>();
    const safeRecords: TradingRecord[] = [];
    for (const rawRecord of records) {
      if (!isPlainObject(rawRecord)) return null;
      const { id, date, type, amount, note } = rawRecord;
      if (typeof id !== "string" || !id.trim() || seenIds.has(id)) return null;
      if (!isValidDate(date) || !date.startsWith(monthKey + "-")) return null;
      if (type !== "profit" && type !== "loss") return null;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
      if (typeof note !== "string") return null;
      seenIds.add(id);
      safeRecords.push({ id, date, type, amount, note });
    }
    months[monthKey] = { target, review, records: safeRecords };
  }

  return { version: 1, selectedMonth: value.selectedMonth, months };
}

export function readTradingPlanState(storageKey = TRADING_PLAN_STORAGE_KEY): ReadResult {
  const fallback = emptyState();
  if (typeof window === "undefined") return { state: fallback, status: "unavailable" };

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return { state: fallback, status: "available" };
    const parsed: unknown = JSON.parse(raw);
    const validated = validateTradingPlanState(parsed);
    return validated
      ? { state: validated, status: "available" }
      : { state: fallback, status: "invalid" };
  } catch {
    return { state: fallback, status: "unavailable" };
  }
}

export function parseTradingPlanBackup(text: string): TradingPlanState {
  const parsed: unknown = JSON.parse(text);
  if (!isPlainObject(parsed) || parsed.format !== "xau_news_ai_trading_plan_backup" || parsed.version !== 1) {
    throw new Error("Format backup tidak dikenali. Pilih file backup Trading Plan dari aplikasi ini.");
  }
  const validated = validateTradingPlanState(parsed.data);
  if (!validated) throw new Error("Isi backup tidak valid. Data yang sekarang tidak diubah.");
  return validated;
}

export function createBackupPayload(state: TradingPlanState): string {
  return JSON.stringify({
    format: "xau_news_ai_trading_plan_backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  }, null, 2);
}

export function calculateMonth(plan: MonthPlan) {
  const totalProfit = plan.records.reduce((sum, record) => sum + (record.type === "profit" ? record.amount : 0), 0);
  const totalLoss = plan.records.reduce((sum, record) => sum + (record.type === "loss" ? record.amount : 0), 0);
  const netResult = totalProfit - totalLoss;
  const rawProgress = plan.target > 0 ? (netResult / plan.target) * 100 : 0;
  const progress = Math.max(0, Math.min(100, rawProgress));
  return {
    totalProfit,
    totalLoss,
    netResult,
    rawProgress,
    progress,
    recordCount: plan.records.length,
    remainingTarget: plan.target - netResult,
  };
}

export function formatRupiah(amount: number): string {
  const sign = amount < 0 ? "- " : "";
  const abs = Math.abs(amount);
  return sign + "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(abs);
}

export function formatSignedRupiah(amount: number, positivePlus = true): string {
  if (amount > 0 && positivePlus) return "+ " + formatRupiah(amount);
  if (amount < 0) return "- " + formatRupiah(Math.abs(amount));
  return formatRupiah(amount);
}

export function recordId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through for browsers that block crypto APIs.
  }
  return "record-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
