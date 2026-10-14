import {
  isChecklist,
  STAGE_STATUS,
  DOC_STATUS,
  statusColor,
  type Work,
  type Item,
  type User,
} from "../model";

import ResponsibleSelect from "./ResponsibleSelect";

import { enqueueFile, getFile } from "./files";

type ItemKind = "stages" | "startDocs" | "endDocs";

type Props = {
  work: Work;
  kind: ItemKind;
  users: User[];
  change: (kind: ItemKind, id: string, patch: Partial<Item>) => void;
  readOnly?: boolean;
};

const displayDate = (value: string) =>
  value
    ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")
    : "—";

export default function ItemTable({
  work,
  kind,
  users,
  change,
  readOnly = false,
}: Props) {
  return (
    <div className="table-scroll">
      <table className="items-table">
        <thead>
          <tr>
            <th>{kind === "stages" ? "Etapa" : "Documento"}</th>
            <th>Status</th>
            <th>Responsável</th>
            <th>Data Status</th>
            <th>Previsão início</th>
            <th>Previsão término</th>
            <th>Observação</th>
            <th>Anexos</th>
          </tr>
        </thead>

        <tbody>
          {work[kind].map((item, index) => {
            const automatic = kind === "stages" && isChecklist(item.name);

            return (
              <tr
                key={item.id}
                className={
                  statusColor(item.status, item.end) === "red"
                    ? "overdue-row"
                    : ""
                }
              >
                <td>
                  <strong>{item.name}</strong>

                  {item.guidance && (
                    <small className="guidance">{item.guidance}</small>
                  )}
                </td>

                <td>
                  {automatic || readOnly ? (
                    <span
                      className={"pill " + statusColor(item.status, item.end)}
                    >
                      {item.status}
                    </span>
                  ) : (
                    <select
                      value={item.status}
                      className={
                        "status-select " + statusColor(item.status, item.end)
                      }
                      onChange={(event) =>
                        change(kind, item.id, {
                          status: event.target.value,
                        })
                      }
                    >
                      {(kind === "stages" ? STAGE_STATUS : DOC_STATUS).map(
                        (status) => (
                          <option
                            key={status}
                            disabled={status === "CADASTRADO"}
                          >
                            {status}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </td>

                <td>
                  <ResponsibleSelect
                    users={users}
                    value={item.responsible}
                    disabled={readOnly}
                    onChange={(responsible) =>
                      change(kind, item.id, { responsible })
                    }
                  />
                </td>

                <td>{displayDate(item.statusAt)}</td>

                <td>
                  <input
                    type="date"
                    disabled={automatic || readOnly}
                    value={item.start}
                    onChange={(event) =>
                      change(kind, item.id, {
                        start: event.target.value,
                      })
                    }
                  />
                </td>

                <td>
                  <input
                    type="date"
                    disabled={automatic || readOnly}
                    value={item.end}
                    onChange={(event) =>
                      change(kind, item.id, {
                        end: event.target.value,
                      })
                    }
                  />
                </td>

                <td>
                  <textarea
                    readOnly={readOnly}
                    rows={3}
                    value={item.note}
                    onChange={(event) =>
                      change(kind, item.id, {
                        note: event.target.value,
                      })
                    }
                  />
                </td>

                <td>
                  {item.attachments?.map((file) => (
                    <button
                      key={file.id}
                      onClick={async () => {
                        try {
                          const blob = await getFile(file.id);

                          const link = document.createElement("a");

                          link.href = URL.createObjectURL(blob);

                          link.download = file.name;

                          link.click();

                          setTimeout(
                            () => URL.revokeObjectURL(link.href),
                            1000,
                          );
                        } catch (error) {
                          alert(String(error));
                        }
                      }}
                    >
                      {file.name}
                    </button>
                  ))}

                  {!readOnly && (
                    <label className="upload">
                      Adicionar arquivo
                      <input
                        type="file"
                        hidden
                        onChange={async (event) => {
                          const file = event.target.files?.[0];

                          if (!file) {
                            return;
                          }

                          try {
                            const id = await enqueueFile(
                              work.id,
                              item.id,
                              "document",
                              file,
                            );

                            change(kind, item.id, {
                              attachments: [
                                ...(item.attachments || []),
                                {
                                  id,
                                  name: file.name,
                                  mime: file.type,
                                  size: file.size,
                                },
                              ],
                            });
                          } catch (error) {
                            alert(String(error));
                          }

                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}

                  <small>{index + 1}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
