// Deutsche Formatierungs-Helfer (EUR, dd.mm.yyyy, Zahlen)

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM_INT = new Intl.NumberFormat("de-DE");

const DATE = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEUR(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return EUR.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return NUM.format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return NUM_INT.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return DATE.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return DATETIME.format(d);
}

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.floor((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string | Date, days: number): string {
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
