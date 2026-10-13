import {
  useEffect,
  useState,
} from "react";

import ResponsibleSelect from "./ResponsibleSelect";

import {
  toReferenceReport,
} from "./reportModel";

import {
  type Work,
  type User,
  type PhotoReport,
  uid,
  dateToday,
} from "../model";

import {
  type PhotoReport as ReferenceReport,
  type StoredFile,
} from "../reference/types";

import {
  PhotoEditor,
} from "../reference/components/PhotoEditor";

import {
  enqueueFile,
  getFile,
} from "./files";

import { supabase } from "../data";

const dataUrl = (
  blob: Blob,
) =>
  new Promise<string>(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () =>
        resolve(
          String(reader.result),
        );

      reader.onerror = () =>
        reject(reader.error);

      reader.readAsDataURL(blob);
    },
  );

function sanitize(
  report: ReferenceReport,
): ReferenceReport {
  return {
    ...report,

    fotos: report.fotos.map(
      (photo) => ({
        ...photo,
        imagem: photo.imagem
          ? {
              ...photo.imagem,
              data:
                photo.imagem.data
                  .startsWith("blob:")
                  ? ""
                  : photo.imagem.data,
            }
          : null,
      }),
    ),

    anexos: report.anexos.map(
      (file) => ({
        ...file,
        data:
          file.data.startsWith("blob:")
            ? ""
            : file.data,
      }),
    ),
  };
}

type Props = {
  work: Work;
  update: (
    patch: Partial<Work>,
  ) => void;
  users: User[];
  admin: boolean;
  editing: boolean;
  onSaveDraft?: () => Promise<void>;
  onConclude?: (id: string) => Promise<void>;
};

export default function Reports({
  work,
  update,
  users,
  admin,
  editing,
  onSaveDraft,
  onConclude,
}: Props) {
  const [
    selected,
    setSelected,
  ] = useState("");

  const [
    urls,
    setUrls,
  ] = useState<
    Record<string, string>
  >({});

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const report =
    work.reports.find(
      (item) =>
        item.id === selected,
    );

  const reference = report
    ? toReferenceReport(
        report,
        work,
        users,
      )
    : null;

  useEffect(() => {
    let alive = true;

    const created: string[] = [];

    if (reference) {
      const files = [
        ...reference.fotos.flatMap(
          (photo) =>
            photo.imagem
              ? [photo.imagem]
              : [],
        ),
        ...reference.anexos,
      ];

      void Promise.all(
        files
          .filter(
            (file) => !file.data,
          )
          .map(
            async (file) => {
              try {
                const url =
                  URL.createObjectURL(
                    await getFile(
                      file.id,
                    ),
                  );

                created.push(url);

                if (alive) {
                  setUrls(
                    (current) => ({
                      ...current,
                      [file.id]: url,
                    }),
                  );
                }
              } catch {
                if (alive) {
                  setError(
                    "Alguns arquivos estão indisponíveis neste dispositivo.",
                  );
                }
              }
            },
          ),
      );
    }

    return () => {
      alive = false;
      created.forEach(
        URL.revokeObjectURL,
      );
    };
  }, [
    selected,
    work.reports,
  ]);

  const change = (
    patch: Partial<PhotoReport>,
  ) => {
    if (
      !report ||
      !editing ||
      report.status === "CONCLUÍDO"
    ) {
      return;
    }

    update({
      reports:
        work.reports.map(
          (item) =>
            item.id === report.id
              ? {
                  ...report,
                  ...patch,
                }
              : item,
        ),
    });
  };

  const pdf = async (
    item: PhotoReport,
  ) => {
    setBusy(true);

    try {
      const model =
        toReferenceReport(
          item,
          work,
          users,
        );

      const hydrate = async (
        file: StoredFile,
      ): Promise<StoredFile> => ({
        ...file,
        data:
          file.data &&
          !file.data.startsWith("blob:")
            ? file.data
            : await dataUrl(
                await getFile(file.id),
              ),
      });

      const full = {
        ...model,

        fotos:
          await Promise.all(
            model.fotos.map(
              async (photo) => ({
                ...photo,
                imagem: photo.imagem
                  ? await hydrate(
                      photo.imagem,
                    )
                  : null,
              }),
            ),
          ),

        anexos:
          await Promise.all(
            model.anexos.map(
              hydrate,
            ),
          ),
      };

      const {
        generatePhotoPdf,
      } = await import(
        "../reference/lib/photoPdf"
      );

      const output =
        await generatePhotoPdf(full);

      const link =
        document.createElement("a");

      link.href = output.url;
      link.download = output.fileName;
      link.click();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            output.url,
          ),
        1000,
      );

      if (
        item.status !== "CONCLUÍDO" ||
        admin
      ) {
        await enqueueFile(
          work.id,
          item.id,
          "pdf",
          new File(
            [output.blob],
            output.fileName,
            {
              type: "application/pdf",
            },
          ),
        );
      }
    } catch (failure) {
      setError(
        String(failure),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          const id = uid();

          update({
            reports: [
              ...work.reports,
              {
                id,
                title: "Novo relatório",
                date: dateToday(),
                status: "EM ELABORAÇÃO",
                photos: [],
              },
            ],
          });

          setSelected(id);
        }}
      >
        Novo relatório
      </button>

      <p role="alert">
        {error}
      </p>

      <div className="report-cards">{work.reports.map(
        (item) => (
          <div
            key={item.id}
            className="report-card"
          >
            {item.reference?.fotos?.[0]?.imagem && <img alt="Prévia do relatório" src={item.reference.fotos[0].imagem.data || urls[item.reference.fotos[0].imagem.id] || ""} />}
            <strong>
              {item.title}
              {" · "}
              {item.date}
              {" · "}
              {item.status ||
                "EM ELABORAÇÃO"}
            </strong>

            <button
              onClick={() =>
                setSelected(item.id)
              }
            >
              Consultar / editar
            </button>

            <button
              disabled={busy}
              onClick={() =>
                void pdf(item)
              }
            >
              Disponibilizar PDF
            </button>
          </div>
        ),
      )}</div>

      {report && reference && (
        <div className="report-modal" role="dialog" aria-modal="true" aria-label="Relatório fotográfico">
          <div className="report-modal-content"><div className="report-modal-header"><strong>{report.title} · {report.status}</strong><button onClick={()=>setSelected("")}>Fechar janela</button></div>
          <label>
            Responsável

            <ResponsibleSelect
              users={users}
              disabled={
                !editing ||
                (
                  report.status ===
                    "CONCLUÍDO"
                )
              }
              value={
                report.responsible ||
                ""
              }
              onChange={(
                responsible,
              ) =>
                change({
                  responsible,
                  reference: {
                    ...reference,
                    responsavel: {
                      ...reference.responsavel,
                      elaboradoPor:
                        users.find(
                          (user) =>
                            user.id ===
                            responsible,
                        )?.name || "",
                    },
                  },
                })
              }
            />
          </label>

          <fieldset
            disabled={
              !editing ||
              (
                report.status ===
                  "CONCLUÍDO"
              )
            }
          >
            <div className="reference-report">
              <PhotoEditor
                report={{
                  ...reference,

                  fotos:
                    reference.fotos.map(
                      (photo) => ({
                        ...photo,
                        imagem:
                          photo.imagem
                            ? {
                                ...photo.imagem,
                                data:
                                  photo.imagem.data ||
                                  urls[
                                    photo.imagem.id
                                  ] ||
                                  "",
                              }
                            : null,
                      }),
                    ),

                  anexos:
                    reference.anexos.map(
                      (file) => ({
                        ...file,
                        data:
                          file.data ||
                          urls[file.id] ||
                          "",
                      }),
                    ),
                }}

                onChange={(model) =>
                  change({
                    reference:
                      sanitize(model),
                    title:
                      model.caracterizacao
                        .tipoRelatorio,
                    date:
                      model.responsavel.data,
                  })
                }

                onSaveBack={() =>
                  setSelected("")
                }

                onPdf={() =>
                  void pdf(report)
                }

                onExport={() => {
                  const blob =
                    new Blob(
                      [
                        JSON.stringify(
                          reference,
                          null,
                          2,
                        ),
                      ],
                      {
                        type:
                          "application/json",
                      },
                    );

                  const link =
                    document.createElement(
                      "a",
                    );

                  link.href =
                    URL.createObjectURL(
                      blob,
                    );

                  link.download =
                    "relatorio.json";

                  link.click();

                  URL.revokeObjectURL(
                    link.href,
                  );
                }}

                busy={busy}

                storeFile={async (file) => {
                  const id =
                    await enqueueFile(
                      work.id,
                      report.id,
                      file.type.startsWith(
                        "image/",
                      )
                        ? "photo"
                        : "attachment",
                      file,
                    );

                  const url =
                    URL.createObjectURL(
                      file,
                    );

                  setUrls(
                    (current) => ({
                      ...current,
                      [id]: url,
                    }),
                  );

                  return {
                    id,
                    name: file.name,
                    type: file.type,
                    data: url,
                    descricao: "",
                  };
                }}
              />
            </div>

            {report.status !==
              "CONCLUÍDO" && (
              <button
                className="primary"
                onClick={async () => {
                  if (
                    !report.responsible ||
                    !reference.caracterizacao
                      .tipoRelatorio ||
                    !reference.fotos.length ||
                    reference.fotos.some(
                      (photo) =>
                        !photo.titulo ||
                        !photo.imagem,
                    ) ||
                    !reference.responsavel
                      .matricula ||
                    !reference.responsavel
                      .cargo ||
                    !reference.responsavel
                      .empresa ||
                    !reference.obra
                      .empresaExecutora ||
                    !reference.obra
                      .contrato
                  ) {
                    setError(
                      "Preencha responsável, identificação, contrato, títulos e fotografias antes de concluir.",
                    );

                    return;
                  }

                  if (supabase) {
                    const ids = [
                      ...reference.fotos
                        .flatMap(
                          (photo) =>
                            photo.imagem
                              ? [
                                  photo.imagem.id,
                                ]
                              : [],
                        ),
                      ...reference.anexos
                        .map(
                          (file) =>
                            file.id,
                        ),
                    ];

                    const {
                      data,
                      error,
                    } = await supabase
                      .from("drive_files")
                      .select(
                        "id,kind,status",
                      )
                      .eq(
                        "work_id",
                        work.id,
                      )
                      .eq(
                        "entity_id",
                        report.id,
                      );

                    if (
                      error ||
                      ids.some(
                        (id) =>
                          !data?.some(
                            (file) =>
                              file.id === id &&
                              file.status ===
                                "uploaded",
                          ),
                      ) ||
                      !data?.some(
                        (file) =>
                          file.kind ===
                            "pdf" &&
                          file.status ===
                            "uploaded",
                      )
                    ) {
                      setError(
                        "Confirme o relatório em elaboração, disponibilize seu PDF e aguarde o envio dos arquivos antes de concluir.",
                      );

                      return;
                    }
                  }

                  if (onConclude) await onConclude(report.id);
                  else change({status: "CONCLUÍDO"});
                }}
              >
                Concluir relatório
              </button>
            )}
          </fieldset>
          {report.status !== "CONCLUÍDO" && <button className="primary" onClick={()=>void onSaveDraft?.()}>Salvar rascunho</button>}
          </div>
        </div>
      )}
    </>
  );
}
