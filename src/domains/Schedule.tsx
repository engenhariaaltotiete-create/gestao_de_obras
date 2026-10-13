import {
  useState,
  type ReactNode,
} from "react";

import {
  dateToday,
  statusColor,
  money,
  budgetTotal,
  executionPercent,
  effectiveLength,
  workStatus,
  type Work,
  type User,
} from "../model";

import {
  day,
  validRange,
  workRange,
  forecast,
} from "./planning";

type Row = {
  id: string;
  name: ReactNode;
  start: string;
  end: string;
  status: string;
  responsible?: string;
  note?: string;
};

type TimelineProps = {
  rows: Row[];
  users?: User[];
  header?: ReactNode;
};

export function Timeline({
  rows,
  users = [],
  header,
}: TimelineProps) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  const dates = rows
    .filter(
      (row) =>
        validRange(
          row.start,
          row.end,
        ),
    )
    .flatMap(
      (row) => [
        day(row.start),
        day(row.end),
      ],
    );

  const first = dates.length
    ? Math.min(...dates)
    : day(dateToday());

  const last = dates.length
    ? Math.max(...dates)
    : first;

  const span =
    (last - first) / 86400000 + 1;

  // A faixa temporal ocupa sempre a largura disponível, sem rolagem interna.

  const now =
    (
      (day(dateToday()) - first) /
      86400000 /
      span
    ) * 100;

  const ticks: {
    t: number;
    label: string;
  }[] = [];

  for (
    let timestamp = first;
    timestamp <= last;
    timestamp += 86400000
  ) {
    const date = new Date(timestamp);

    if (
      timestamp === first ||
      date.getUTCDate() === 1 ||
      (span <= 100 && date.getUTCDay() === 1)
    ) {
      const prefix =
        date.getUTCDate() === 1 ||
        timestamp === first
          ? (
              date.toLocaleDateString(
                "pt-BR",
                {
                  timeZone: "UTC",
                  month: "long",
                  year: "numeric",
                },
              ) + " · "
            )
          : "Semana · ";

      ticks.push({
        t: timestamp,
        label:
          prefix +
          date.toLocaleDateString(
            "pt-BR",
            {
              timeZone: "UTC",
              day: "2-digit",
              month: "short",
            },
          ),
      });
    }
  }

  return (
    <div
      className={
        expanded
          ? "schedule-expanded"
          : "schedule"
      }
    >
      {header}

      <button
        onClick={() =>
          setExpanded(!expanded)
        }
      >
        {expanded
          ? "Fechar visualização expandida"
          : "Expandir cronograma"}
      </button>

      {expanded && (
        <button
          onClick={() =>
            window.print()
          }
        >
          Imprimir
        </button>
      )}

      <div className="timeline-responsive">
        <table className="timeline-table">
          <thead>
            <tr>
              <th>
                Etapa / Documento / Obra
              </th>

              <th>
                <div
                  className="timeline-axis"
                  
                >
                  {ticks.map(
                    (tick) => (
                      <span
                        key={tick.t}
                        style={{
                          left:
                            (
                              (
                                tick.t - first
                              ) /
                              86400000 /
                              span
                            ) * 100 + "%",
                        }}
                      >
                        {tick.label}
                      </span>
                    ),
                  )}
                </div>
              </th>

              <th>Status</th>
              <th>Responsável</th>
              <th>Observação</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(
              (row) => (
                <tr key={row.id}>
                  <td>
                    {row.name}
                  </td>

                  <td>
                    <div
                      className="timeline-track"
                      
                    >
                      {ticks.map(
                        (tick) => (
                          <i
                            key={tick.t}
                            className="timeline-grid"
                            style={{
                              left:
                                (
                                  (
                                    tick.t -
                                    first
                                  ) /
                                  86400000 /
                                  span
                                ) * 100 + "%",
                            }}
                          />
                        ),
                      )}

                      {now >= 0 &&
                        now <= 100 && (
                          <i
                            className="today-line"
                            title="Hoje"
                            style={{
                              left:
                                now + "%",
                            }}
                          />
                        )}

                      {validRange(
                        row.start,
                        row.end,
                      ) && (
                        <div
                          className={
                            "gantt-bar " +
                            statusColor(
                              row.status,
                              row.end,
                            )
                          }
                          title={
                            row.start +
                            " a " +
                            row.end
                          }
                          style={{
                            left:
                              (
                                (
                                  day(row.start) -
                                  first
                                ) /
                                86400000 /
                                span
                              ) * 100 + "%",

                            width:
                              (
                                (
                                  (
                                    day(row.end) -
                                    day(row.start)
                                  ) /
                                  86400000 +
                                  1
                                ) /
                                span
                              ) * 100 + "%",
                          }}
                        />
                      )}
                    </div>

                    <small>
                      {row.start}
                      {" — "}
                      {row.end}
                    </small>
                  </td>

                  <td>
                    <span
                      className={
                        "pill " +
                        statusColor(
                          row.status,
                          row.end,
                        )
                      }
                    >
                      {row.status}
                    </span>
                  </td>

                  <td>
                    {users.find(
                      (user) =>
                        user.id ===
                        row.responsible,
                    )?.name || "—"}
                  </td>

                  <td className="schedule-note">
                    {row.note}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WorkSchedule({
  work,
  users,
}: {
  work: Work;
  users: User[];
}) {
  const [
    open,
    setOpen,
  ] = useState<string[]>([]);

  const hidden = (
    status: string,
  ) =>
    [
      "CADASTRADO",
      "CANCELADO",
      "NÃO SE APLICA",
    ].includes(status);

  const rows: Row[] = [];

  for (
    const [index, stage]
    of work.stages.entries()
  ) {
    const docs =
      index === 3
        ? work.startDocs
        : index === 10
          ? work.endDocs
          : undefined;

    if (!hidden(stage.status)) {
      rows.push({
        ...stage,
        name: docs ? (
          <button
            onClick={() =>
              setOpen(
                (current) =>
                  current.includes(
                    stage.id,
                  )
                    ? current.filter(
                        (id) =>
                          id !== stage.id,
                      )
                    : [
                        ...current,
                        stage.id,
                      ],
              )
            }
          >
            {open.includes(stage.id)
              ? "−"
              : "+"}
            {" "}
            {stage.name}
          </button>
        ) : (
          stage.name
        ),
      });
    }

    if (
      docs &&
      open.includes(stage.id)
    ) {
      rows.push(
        ...docs
          .filter(
            (doc) =>
              !hidden(doc.status),
          )
          .map(
            (doc) => ({
              ...doc,
              name:
                "↳ " + doc.name,
            }),
          ),
      );
    }
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
    [
      "Extensão calculada (m)",
      effectiveLength(work).toFixed(1),
    ],
    ["Ligações", work.links],
    ["PNG", work.png],
    ["Booster/EEE", work.booster],
    ["VRP", work.vrp],
    [
      "Pavimentos",
      work.pavements
        .map(
          (pavement) =>
            pavement.type +
            ": " +
            pavement.length +
            " m",
        )
        .join(", "),
    ],
    [
      "Informações relevantes",
      work.notes,
    ],
    [
      "Orçamento total",
      money(budgetTotal(work)),
    ],
    [
      "Status geral",
      workStatus(work),
    ],
    [
      "Percentual executado",
      executionPercent(work)
        .toFixed(1) + "%",
    ],
    [
      "Data de emissão",
      dateToday(),
    ],
  ] as const;

  return (
    <Timeline
      rows={rows}
      users={users}
      header={
        <>
          <div className="schedule-heading"><h2>CRONOGRAMA DA OBRA</h2><small>Planejamento e acompanhamento das etapas e documentos da obra</small></div>

          <div className="schedule-identification">
            {identification
              .filter(
                ([, value]) =>
                  value !== "",
              )
              .map(
                ([label, value]) => (
                  <span key={label}>
                    <b>
                      {label}:{" "}
                    </b>
                    {value}
                  </span>
                ),
              )}
          </div>
        </>
      }
    />
  );
}

export function Dashboard({
  works,
  users,
  onOpen,
}: {
  works: Work[];
  users: User[];
  onOpen: (id: string) => void;
}) {
  const included = works.filter(
    (work) =>
      workStatus(work) !==
      "CANCELADO",
  );

  const buckets =
    forecast(included);

  const months = [
    ...new Set(
      buckets.map(
        (bucket) => bucket.month,
      ),
    ),
  ];

  const total = buckets.reduce(
    (sum, bucket) =>
      sum + bucket.cents,
    0,
  );

  const max = Math.max(
    1,
    ...months.map(
      (month) =>
        buckets
          .filter(
            (bucket) =>
              bucket.month === month,
          )
          .reduce(
            (sum, bucket) =>
              sum + bucket.cents,
            0,
          ),
    ),
  );

  const indicators = [
    [
      "TOTAL DE OBRAS",
      included.length,
    ],
    [
      "EXTENSÃO (m)",
      included
        .reduce(
          (sum, work) =>
            sum +
            effectiveLength(work),
          0,
        )
        .toFixed(1),
    ],
    [
      "LIGAÇÕES",
      included.reduce(
        (sum, work) =>
          sum + work.links,
        0,
      ),
    ],
    [
      "PNG",
      included.reduce(
        (sum, work) =>
          sum + work.png,
        0,
      ),
    ],
  ] as const;

  return (
    <>
      <div className="kpis">
        {indicators.map(
          ([label, value]) => (
            <div
              className="kpi"
              key={label}
            >
              <span>
                <small>
                  {label}
                </small>
                <strong>
                  {value}
                </strong>
              </span>
            </div>
          ),
        )}
      </div>

      <Timeline
        users={users}
        rows={included.map(
          (work) => ({
            id: work.id,

            name: (
              <button
                className="link"
                onClick={() =>
                  onOpen(work.id)
                }
              >
                {work.city}
                {" · "}
                {work.address}
                {" · "}
                {work.goal}

                <small>
                  {work.service}
                  {" · "}
                  {work.ae}
                  {" · "}
                  {effectiveLength(work)
                    .toFixed(1)}
                  {" m · "}
                  {work.links}
                  {" Lig. · "}
                  {work.png}
                  {" PNG · "}
                  {money(
                    budgetTotal(work),
                  )}
                  {" · "}
                  {executionPercent(work)
                    .toFixed(1)}
                  {"%"}
                </small>
              </button>
            ),

            ...workRange(work),
            status:
              workStatus(work),
            note:
              work.notes,
          }),
        )}
      />

      <h2>
        PREVISÃO DE EXECUÇÃO SEMANAL
      </h2>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                Indicador
              </th>

              {months.flatMap(
                (month) => [
                  ...buckets
                    .filter(
                      (bucket) =>
                        bucket.month ===
                        month,
                    )
                    .map(
                      (bucket) => (
                        <th
                          key={bucket.key}
                        >
                          {month}
                          <br />
                          {bucket.start.slice(8)}
                          {" a "}
                          {bucket.end.slice(8)}
                        </th>
                      ),
                    ),

                  <th key={month}>
                    {month}
                    <br />
                    TOTAL DO MÊS
                  </th>,
                ],
              )}

              <th>
                TOTAL GERAL
              </th>
            </tr>
          </thead>

          <tbody>
            {(
              [
                "length",
                "links",
              ] as const
            ).map(
              (field) => (
                <tr key={field}>
                  <th>
                    {field === "length"
                      ? "EXTENSÃO PREVISTA (m)"
                      : "LIGAÇÕES PREVISTAS (un.)"}
                  </th>

                  {months.flatMap(
                    (month) => {
                      const selected =
                        buckets.filter(
                          (bucket) =>
                            bucket.month ===
                            month,
                        );

                      return [
                        ...selected.map(
                          (bucket) => (
                            <td
                              key={bucket.key}
                            >
                              {bucket[field]
                                .toLocaleString(
                                  "pt-BR",
                                  {
                                    maximumFractionDigits:
                                      2,
                                  },
                                )}
                            </td>
                          ),
                        ),

                        <td key={month}>
                          <b>
                            {selected
                              .reduce(
                                (sum, bucket) =>
                                  sum +
                                  bucket[field],
                                0,
                              )
                              .toLocaleString(
                                "pt-BR",
                                {
                                  maximumFractionDigits:
                                    2,
                                },
                              )}
                          </b>
                        </td>,
                      ];
                    },
                  )}

                  <td>
                    {buckets
                      .reduce(
                        (sum, bucket) =>
                          sum +
                          bucket[field],
                        0,
                      )
                      .toLocaleString(
                        "pt-BR",
                        {
                          maximumFractionDigits:
                            2,
                        },
                      )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <h2>
        PREVISÃO FINANCEIRA MENSAL — ORÇAMENTO
      </h2>

      <div className="financial-chart">
        {months.map(
          (month) => {
            const cents = buckets
              .filter(
                (bucket) =>
                  bucket.month === month,
              )
              .reduce(
                (sum, bucket) =>
                  sum + bucket.cents,
                0,
              );

            return (
              <div key={month}>
                <strong>
                  {money(cents / 100)}
                </strong>

                <div
                  style={{
                    height:
                      Math.max(
                        2,
                        (
                          cents / max
                        ) * 180,
                      ),
                  }}
                />

                <span>
                  {month}
                </span>
              </div>
            );
          },
        )}
      </div>

      <strong>
        Total previsto:
        {" "}
        {money(total / 100)}
      </strong>

      <p className="hint">
        Obras sem período válido de
        Execução de Obra não geram
        projeções. Semanas que cruzam
        meses são divididas por dia.
      </p>
    </>
  );
}
