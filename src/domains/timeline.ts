import { dateToday } from "../model.ts";
import { day, validRange } from "./planning.ts";
export const DAY = 86400000;
export const monthLabel = (value: string) =>
  new Date(value.slice(0, 7) + "-01T00:00:00Z")
    .toLocaleDateString("pt-BR", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(".", "")
    .replace(" de ", "/")
    .replace(/\s+/g, "/")
    .toUpperCase();
export const financialMonth = (value: string) =>
  value.slice(5, 7) + "/" + value.slice(0, 4);
export function timelineRange(items: { start: string; end: string }[], minimumMonths = 0) {
  const dates = items
    .filter((i) => validRange(i.start, i.end))
    .flatMap((i) => [day(i.start), day(i.end)]);
  const anchor = day(dateToday());
  const earliest = dates.length ? Math.min(...dates) : anchor;
  const latest = dates.length ? Math.max(...dates) : anchor;
  // Uma semana de margem antes e depois de todos os períodos planejados.
  let first = earliest - (minimumMonths > 0 ? 7 * DAY : 0);
  let last = latest + (minimumMonths > 0 ? 7 * DAY : 0);
  if (minimumMonths > 0) {
    const begin = new Date(first);
    const threeMonthEnd = Date.UTC(
      begin.getUTCFullYear(), begin.getUTCMonth() + minimumMonths,
      begin.getUTCDate(),
    ) - DAY;
    last = Math.max(last, threeMonthEnd);
  }
  return {
    first,
    last,
    span: (last - first) / DAY + 1,
    hasDates: dates.length > 0,
  };
}
export type Range = ReturnType<typeof timelineRange>;
export const position = (timestamp: number, range: Range) =>
  ((timestamp - range.first) / DAY / range.span) * 100;
export function calendarTicks(range: Range) {
  const months: { start: number; end: number; label: string }[] = [];
  const weeks: { timestamp: number; label: string }[] = [];
  let start = range.first;
  for (let t = range.first; t <= range.last; t += DAY) {
    const date = new Date(t);
    if (date.getUTCDay() === 1)
      weeks.push({
        timestamp: t,
        label: String(date.getUTCDate()).padStart(2, "0"),
      });
    if (
      t === range.last ||
      new Date(t + DAY).getUTCMonth() !== date.getUTCMonth()
    ) {
      months.push({
        start,
        end: t + DAY,
        label: monthLabel(date.toISOString()),
      });
      start = t + DAY;
    }
  }
  return { months, weeks };
}
