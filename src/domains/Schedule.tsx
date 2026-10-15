import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Ruler, Cable, Users, Activity, Wallet } from "lucide-react";
import {
  dateToday,
  statusColor,
  money,
  budgetTotal,
  executionPercent,
  effectiveLength,
  executionStatus,
  eligible,
  type Work,
  type User,
} from "../model";
import { day, validRange, forecast, type Bucket } from "./planning";
import {
  DAY,
  position,
  timelineRange,
  calendarTicks,
  financialMonth,
  monthLabel,
  type Range,
} from "./timeline";

type Row = {
  id: string;
  name: ReactNode;
  start: string;
  end: string;
  status: string;
  responsible?: string;
  note?: string;
};
function useToday() {
  const [today, setToday] = useState(dateToday);
  useEffect(() => {
    const timer = setInterval(() => setToday(dateToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
function Today({
  range,
  today,
  label = false,
}: {
  range: Range;
  today: string;
  label?: boolean;
}) {
  const t = day(today);
  return range.hasDates && t >= range.first && t <= range.last ? (
    <i
      className="today-line"
      title="Hoje"
      style={{ left: position(t, range) + "%" }}
    >
      {label && <b>HOJE</b>}
    </i>
  ) : null;
}
function Axis({ range, today, dashboard = false }: { range: Range; today: string; dashboard?: boolean }) {
  const { months, weeks } = calendarTicks(range);
  const weekCells = dashboard ? (() => {
    const boundaries = new Set([range.first, range.last + DAY, ...weeks.map((w) => w.timestamp), ...months.map((m) => m.start)]);
    const sorted = [...boundaries].filter((t) => t >= range.first && t <= range.last + DAY).sort((a, b) => a - b);
    return sorted.slice(0, -1).map((start, index) => ({ start, end: sorted[index + 1], label: String(new Date(start).getUTCDay() === 1 ? new Date(start).getUTCDate() : new Date(start - ((new Date(start).getUTCDay() + 6) % 7) * DAY).getUTCDate()).padStart(2, "0") }));
  })() : [];
  return (
    <div className="timeline-axis">
      <div className="axis-months">
        {months.map((m) => (
          <span
            key={m.start}
            style={{
              left: position(m.start, range) + "%",
              width: ((m.end - m.start) / DAY / range.span) * 100 + "%",
            }}
            title={m.label}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="axis-weeks">
        {dashboard ? weekCells.map((w) => (
          <span key={w.start} style={{ left: position(w.start, range) + "%", width: ((w.end - w.start) / DAY / range.span) * 100 + "%" }} title={new Date(w.start).toISOString().slice(0, 10)}>{w.label}</span>
        )) : weeks.map((w) => (
          <span key={w.timestamp} style={{ left: position(w.timestamp, range) + "%" }} title={"Segunda-feira " + new Date(w.timestamp).toISOString().slice(0, 10)}>{w.label}</span>
        ))}
      </div>
      <Today range={range} today={today} label />
    </div>
  );
}
function Track({
  row,
  range,
  today,
  color,
}: {
  row: Row;
  range: Range;
  today: string;
  color?: string;
}) {
  const { weeks } = calendarTicks(range);
  return (
    <div className="timeline-track">
      {weeks.map((w) => (
        <i
          key={w.timestamp}
          className="timeline-grid"
          style={{ left: position(w.timestamp, range) + "%" }}
        />
      ))}
      <Today range={range} today={today} />
      {validRange(row.start, row.end) && !["CANCELADO", "NÃO SE APLICA"].includes(row.status.toLocaleUpperCase("pt-BR")) && (
        <div
          className={"gantt-bar " + (color || statusColor(row.status, row.end))}
          title={`${typeof row.name === "string" ? row.name : ""}: ${row.start} a ${row.end}`}
          style={{
            left: position(day(row.start), range) + "%",
            width:
              (((day(row.end) - day(row.start)) / DAY + 1) / range.span) * 100 +
              "%",
          }}
        />
      )}
    </div>
  );
}
export function Timeline({
  rows,
  users = [],
  header,
}: {
  rows: Row[];
  users?: User[];
  header?: ReactNode | ((actions: ReactNode) => ReactNode);
}) {
  const [expanded, setExpanded] = useState(false);
  const today = useToday();
  const range = timelineRange(rows);
  return (
    <div className={expanded ? "schedule-expanded" : "schedule"}>
      {typeof header === "function" ? header(<div className="schedule-actions schedule-actions-inline">
        <button onClick={() => setExpanded(!expanded)}>{expanded ? "Fechar visualização expandida" : "Expandir gráfico"}</button>
        {expanded && <button onClick={() => window.print()}>Imprimir</button>}
      </div>) : <>{header}<div className="schedule-actions"><button onClick={() => setExpanded(!expanded)}>{expanded ? "Fechar visualização expandida" : "Expandir gráfico"}</button></div></>}
      <div className="timeline-responsive">
        <table className="timeline-table">
          <colgroup>
            <col style={{ width: "17%" }} />
            <col style={{ width: "50%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>ETAPA / DOCUMENTO</th>
              <th>
                <Axis range={range} today={today} />
              </th>
              <th>STATUS</th>
              <th>RESPONSÁVEL</th>
              <th>OBSERVAÇÃO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>
                  <div className="cell-today">
                    <Today range={range} today={today} />
                  </div>
                  <Track row={row} range={range} today={today} />
                </td>
                <td>
                  <span className={"pill " + statusColor(row.status, row.end)}>
                    {row.status}
                  </span>
                </td>
                <td>
                  {users.find((u) => u.id === row.responsible)?.name || "—"}
                </td>
                <td className="schedule-note">{row.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!range.hasDates && (
        <p className="hint">Nenhum período planejado informado.</p>
      )}
    </div>
  );
}
export function WorkSchedule({ work, users }: { work: Work; users: User[] }) {
  const [open, setOpen] = useState<string[]>([]);
  const rows: Row[] = [];
  for (const stage of work.stages) {
    const docs =
      stage.name === "Checklist de Início de Obra"
        ? work.startDocs
        : stage.name === "Checklist de Conclusão de Obra"
          ? work.endDocs
          : undefined;
    rows.push({
      ...stage,
      name: docs ? (
        <button
          aria-expanded={open.includes(stage.id)}
          onClick={() =>
            setOpen((v) =>
              v.includes(stage.id)
                ? v.filter((id) => id !== stage.id)
                : [...v, stage.id],
            )
          }
        >
          {open.includes(stage.id) ? "−" : "+"} {stage.name}
        </button>
      ) : (
        stage.name
      ),
    });
    if (docs && open.includes(stage.id))
      rows.push(...docs.map((doc) => ({ ...doc, name: "↳ " + doc.name })));
  }
  const identification = [
    ["Município", work.city],
    ["Endereço", work.address],
    ["Bairro", work.district],
    ["Objetivo", work.goal],
    ["Tipo de obra", work.kind],
    ["Serviço", work.service],
    ["Água/Esgoto", work.ae],
    ["Método", work.method],
    ["Prioridade", work.priority],
    ["Extensão calculada (m)", effectiveLength(work).toFixed(1)],
    ["Ligações", work.links],
    ["PNG", work.png],
    ["Booster/EEE", work.booster],
    ["VRP", work.vrp],
    ["Solicitante", work.requester],
    ["Documento de solicitação", work.requestDocument],
    [
      "Pavimentos",
      work.pavements.map((p) => `${p.type}: ${p.length} m`).join(", "),
    ],
    ["Data de cadastro", work.createdAt.slice(0, 10)],
    ["Data de emissão", dateToday()],
  ];
  return (
    <Timeline
      rows={rows}
      users={users}
      header={(actions) => (
        <>
          <div className="schedule-heading">
            <div>
              <h2>CRONOGRAMA DA OBRA</h2>
              <small>Planejamento e acompanhamento das etapas e documentos da obra</small>
            </div>
            {actions}
          </div>
          <div className="schedule-summary">
            <div className="schedule-identification">
              {identification.map(([label, value]) => (
                <span key={label}>
                  <b>{label}: </b>
                  {value || "—"}
                </span>
              ))}
              <span className="identification-notes">
                <b>Informações relevantes: </b>
                {work.notes || "—"}
              </span>
            </div>
            <div className="schedule-cards">
              <div className="kpi">
                <Activity />
                <span>
                  <small>STATUS DA EXECUÇÃO</small>
                  <strong>{executionStatus(work)}</strong>
                </span>
              </div>
              <div className="kpi">
                <Ruler />
                <span>
                  <small>% EXECUTADO</small>
                  <strong>{executionPercent(work).toFixed(1)}%</strong>
                </span>
              </div>
              <div className="kpi">
                <Wallet />
                <span>
                  <small>ORÇAMENTO TOTAL</small>
                  <strong>{money(budgetTotal(work))}</strong>
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    />
  );
}
function GeneralTimeline({
  works,
  onOpen,
  range,
}: {
  works: Work[];
  onOpen: (id: string) => void;
  range: Range;
}) {
  const today = useToday();
  const [expanded, setExpanded] = useState(false);
  const [collapsedCities, setCollapsedCities] = useState<string[]>([]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Work[]>();
    for (const work of works) {
      const city = work.city?.trim() || "Município não informado";
      grouped.set(city, [...(grouped.get(city) || []), work]);
    }
    return [...grouped].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [works]);
  return (
    <section
      className={
        expanded ? "schedule-expanded general-schedule" : "general-schedule"
      }
    >
      <div className="section-head">
        <h2>GANTT GERAL</h2>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "Fechar visualização expandida" : "Expandir cronograma"}
        </button>
      </div>
      <div className="timeline-responsive">
        <table className="general-timeline">
          <colgroup>
            {[20, 4, 6, 4, 4, 6, 6, 50].map((width, i) => (
              <col key={i} style={{ width: width + "%" }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {[
                "ENDEREÇO",
                "A/E",
                "EXT (M)",
                "LIG.",
                "PNG",
                "% EXEC.",
                "STATUS EXECUÇÃO",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
              <th className="general-axis-header"><Axis range={range} today={today} dashboard /></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([city, cityWorks]) => (
              <Fragment key={city}>
                <tr className="municipality-row">
                  <th colSpan={8}>
                    <button
                      className="municipality-toggle"
                      aria-expanded={!collapsedCities.includes(city)}
                      onClick={() => setCollapsedCities((previous) =>
                        previous.includes(city) ? previous.filter((value) => value !== city) : [...previous, city]
                      )}
                    >
                      <span>{collapsedCities.includes(city) ? "▸" : "▾"} {city.toLocaleUpperCase("pt-BR")}</span>
                      <span>{cityWorks.length} obra(s)</span>
                      <span>{cityWorks.reduce((sum, work) => sum + effectiveLength(work), 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m</span>
                      <span>{cityWorks.reduce((sum, work) => sum + work.links, 0)} lig.</span>
                      <span>{cityWorks.reduce((sum, work) => sum + work.png, 0)} PNG</span>
                    </button>
                  </th>
                </tr>
                {!collapsedCities.includes(city) && cityWorks.map((work) => (
              <tr key={work.id}>
                <td data-label="ENDEREÇO">
                  <button className="link" onClick={() => onOpen(work.id)}>
                    {work.address || "Sem endereço"}
                  </button>
                </td>
                <td data-label="A/E">{work.ae}</td>
                <td data-label="EXT (M)">{effectiveLength(work).toFixed(1)}</td>
                <td data-label="LIG.">{work.links}</td>
                <td data-label="PNG">{work.png}</td>
                <td data-label="% EXEC.">
                  <div
                    className="execution-progress"
                    role="progressbar"
                    aria-label={"Execução de " + work.address}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={executionPercent(work)}
                  >
                    <i style={{ width: executionPercent(work) + "%" }} />
                    <b>{executionPercent(work).toFixed(1)}%</b>
                  </div>
                </td>
                <td data-label="STATUS EXECUÇÃO">
                  <span
                    className={"pill " + statusColor(executionStatus(work))}
                  >
                    {executionStatus(work)}
                  </span>
                </td>
                <td className="general-chart-cell">
                  <div className="cell-today">
                    <Today range={range} today={today} />
                  </div>
                  <div className="general-single-track">
                    {calendarTicks(range).weeks.map((week) => (
                      <i key={week.timestamp} className="general-week-grid" style={{ left: position(week.timestamp, range) + "%" }} />
                    ))}
                    {calendarTicks(range).months.slice(1).map((month) => (
                      <i key={month.start} className="general-month-grid" style={{ left: position(month.start, range) + "%" }} />
                    ))}
                    {(() => {
                      const stages = work.stages.filter((stage) => eligible(stage.status) && validRange(stage.start, stage.end));
                      if (!stages.length) return null;
                      const first = Math.min(...stages.map((stage) => day(stage.start)));
                      const last = Math.max(...stages.map((stage) => day(stage.end)));
                      const totalDays = Math.round((last - first) / DAY) + 1;
                      // Um único elemento contínuo; execução tem prioridade nos períodos sobrepostos.
                      const segments: { start: number; end: number; execution: boolean }[] = [];
                      for (let i = 0; i < totalDays; i++) {
                        const current = first + i * DAY;
                        const active = stages.filter((stage) => day(stage.start) <= current && day(stage.end) >= current);
                        const execution = active.some((stage) => stage.name === "Execução de Obra");
                        const lastSegment = segments.at(-1);
                        if (lastSegment && lastSegment.execution === execution) lastSegment.end = current;
                        else segments.push({ start: current, end: current, execution });
                      }
                      return (
                        <div className="general-unified-bar" style={{ left: position(first, range) + "%", width: (totalDays / range.span) * 100 + "%" }} title={`Planejamento: ${new Date(first).toISOString().slice(0,10)} a ${new Date(last).toISOString().slice(0,10)}`}>
                          {segments.map((segment) => (
                            <span key={segment.start} className={segment.execution ? "general-segment-execution" : "general-segment-other"} style={{ width: ((segment.end - segment.start) / DAY + 1) / totalDays * 100 + "%" }} />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!range.hasDates && (
        <p className="hint">Nenhum período planejado informado.</p>
      )}
    </section>
  );
}
export function Dashboard({
  works,
  onOpen,
}: {
  works: Work[];
  users: User[];
  onOpen: (id: string) => void;
}) {
  const included = works.filter((w) => executionStatus(w) !== "CANCELADO");
  const planned = included.flatMap((work) => work.stages.filter((stage) => eligible(stage.status)));
  const range = timelineRange(planned, 3);
  const forecastValues = forecast(included);
  // As colunas semanais acompanham exatamente o intervalo do Gantt, inclusive semanas vazias.
  const buckets: Bucket[] = [];
  for (let timestamp = range.first; timestamp <= range.last; timestamp += DAY) {
    const date = new Date(timestamp);
    const iso = date.toISOString().slice(0, 10);
    const month = iso.slice(0, 7);
    const monday = new Date(timestamp - ((date.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
    const key = month + "|" + monday;
    const previous = buckets.at(-1);
    if (previous?.key === key) {
      previous.end = iso;
      previous.days += 1;
    } else {
      const value = forecastValues.find((bucket) => bucket.key === key);
      buckets.push({ key, month, start: iso, end: iso, days: 1, length: value?.length || 0, links: value?.links || 0, cents: value?.cents || 0 });
    }
  }
  const months = [...new Set(buckets.map((b) => b.month))];
  const monthCents = (month: string) =>
    buckets.filter((b) => b.month === month).reduce((n, b) => n + b.cents, 0);
  const max = Math.max(1, ...months.map(monthCents));
  const total = buckets.reduce((n, b) => n + b.cents, 0);
  const indicators = [
    { label: "TOTAL DE OBRAS", value: included.length, Icon: Building2 },
    {
      label: "EXTENSÃO (m)",
      value: included.reduce((n, w) => n + effectiveLength(w), 0).toFixed(1),
      Icon: Ruler,
    },
    {
      label: "LIGAÇÕES",
      value: included.reduce((n, w) => n + w.links, 0),
      Icon: Cable,
    },
    {
      label: "PNG",
      value: included.reduce((n, w) => n + w.png, 0),
      Icon: Users,
    },
  ];
  return (
    <>
      <div className="kpis">
        {indicators.map(({ label, value, Icon }) => (
          <div className="kpi" key={label}>
            <Icon aria-hidden="true" />
            <span>
              <small>{label}</small>
              <strong>{value}</strong>
            </span>
          </div>
        ))}
      </div>
      <GeneralTimeline works={included} onOpen={onOpen} range={range} />
      <h2 className="dashboard-section-title">PREVISÃO DE EXECUÇÃO SEMANAL</h2>
      <div className="forecast-fit">
        <table className="forecast-table">
          <thead>
            <tr>
              <th rowSpan={2}>Indicador</th>
              {months.map((month) => (
                <th
                  key={month}
                  colSpan={buckets.filter((b) => b.month === month).length + 1}
                >
                  {monthLabel(month)}
                </th>
              ))}
              <th rowSpan={2}>TOTAL GERAL</th>
            </tr>
            <tr>
              {months.flatMap((month) => [
                ...buckets
                  .filter((b) => b.month === month)
                  .map((b) => (
                    <th key={b.key} title={`${b.start} a ${b.end}`}>
                      {b.key.split("|")[1].slice(8)}
                    </th>
                  )),
                <th key={month} className="forecast-month-total"><span>TOTAL</span></th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {(["length", "links"] as const).map((field) => (
              <tr key={field}>
                <th>
                  {field === "length"
                    ? "EXTENSÃO PREVISTA (m)"
                    : "LIGAÇÕES PREVISTAS (un.)"}
                </th>
                {months.flatMap((month) => {
                  const selected = buckets.filter((b) => b.month === month);
                  return [
                    ...selected.map((b) => (
                      <td key={b.key}>
                        {b[field].toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    )),
                    <td key={month} className="forecast-month-total-value">
                      <b>
                        {selected
                          .reduce((n, b) => n + b[field], 0)
                          .toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                      </b>
                    </td>,
                  ];
                })}
                <td>
                  {buckets
                    .reduce((n, b) => n + b[field], 0)
                    .toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="dashboard-section-title">PREVISÃO FINANCEIRA MENSAL — ORÇAMENTO</h2>
      <div className="financial-chart">
        {months.map((month) => (
          <div key={month}>
            <strong>{money(monthCents(month) / 100)}</strong>
            <div
              style={{ height: Math.max(2, (monthCents(month) / max) * 180) }}
            />
            <span>{financialMonth(month)}</span>
          </div>
        ))}
      </div>
      <strong>Total previsto: {money(total / 100)}</strong>
      <p className="hint">
        Obras sem período válido de Execução de Obra não geram projeções.
        Semanas que cruzam meses são divididas por dia; ligações são atribuídas
        à semana de término.
      </p>
    </>
  );
}
