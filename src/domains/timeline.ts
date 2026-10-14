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
export function timelineRange(items: { start: string; end: string }[]) {
  const dates = items
    .filter((i) => validRange(i.start, i.end))
    .flatMap((i) => [day(i.start), day(i.end)]);
  const first = dates.length ? Math.min(...dates) : day(dateToday());
  const last = dates.length ? Math.max(...dates) : first;
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
