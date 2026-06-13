// Date formatting that doesn't drift a day (#54). A date-only "YYYY-MM-DD"
// passed to `new Date(str)` is parsed as UTC midnight, then formatted in the
// host's LOCAL timezone — for any US user (UTC−4/−5) that renders the PREVIOUS
// day. Trip arrive/depart are stored date-only, so they must be parsed as local.
// Full ISO timestamps (journal created_at) are real instants and pass straight
// through `new Date`.

export function parseDateLocal(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Aug 5 – 8" / "Aug 5 – Sep 2" / "Aug 5". Accepts date-only strings or Date
// objects. `locale` is overridable for deterministic tests.
export function formatDateRange(arrive, depart, locale) {
  const a = arrive instanceof Date ? arrive : parseDateLocal(arrive);
  const b = depart ? (depart instanceof Date ? depart : parseDateLocal(depart)) : null;
  if (!a) return "";
  const monthDay = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  if (!b) return monthDay.format(a);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) return `${monthDay.format(a)} – ${new Intl.DateTimeFormat(locale, { day: "numeric" }).format(b)}`;
  return `${monthDay.format(a)} – ${monthDay.format(b)}`;
}

// Whole nights between two date-only values (or Dates); null if either missing.
export function nightsBetween(arrive, depart) {
  const a = arrive instanceof Date ? arrive : parseDateLocal(arrive);
  const b = depart instanceof Date ? depart : parseDateLocal(depart);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
