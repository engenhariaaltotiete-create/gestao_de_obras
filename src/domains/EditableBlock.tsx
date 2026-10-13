import {
  useState,
  useEffect,
  type ReactNode,
} from "react";

import type { Work } from "../model";

import {
  saveDraft,
  loadDraft,
} from "./drafts";

import {
  validateWork,
  validRange,
} from "./planning";

type Props = {
  work: Work;
  id: string;
  owner: string;
  save: (work: Work) => Promise<void>;
  children: (
    work: Work,
    change: (
      patch:
        | Partial<Work>
        | ((work: Work) => Work),
    ) => void,
    editing: boolean,
  ) => ReactNode;
};

export default function EditableBlock({
  work,
  id,
  owner,
  save,
  children,
}: Props) {
  const key =
    owner + ":" + work.id + ":" + id;

  const [
    recoverable,
    setRecoverable,
  ] = useState<Work | null>(null);

  const [
    draft,
    setDraft,
  ] = useState<Work | null>(null);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    void loadDraft(key).then(
      (saved) =>
        setRecoverable(saved || null),
    );
  }, [key]);

  useEffect(() => {
    if (draft) {
      void saveDraft(key, draft).catch(
        (failure) =>
          setError(
            "Falha ao persistir rascunho: " +
              String(failure),
          ),
      );
    }
  }, [draft, key]);

  const finish = async () => {
    if (!draft) {
      return;
    }

    const errors =
      id === "dados"
        ? validateWork(draft)
        : [];

    if (
      id === "orcamento" &&
      draft.budget.some(
        (row) =>
          !row.description.trim() ||
          !Number.isFinite(row.quantity) ||
          row.quantity < 0 ||
          !Number.isFinite(row.unitPrice) ||
          row.unitPrice < 0,
      )
    ) {
      errors.push(
        "Informe descrição e valores válidos em todos os itens do orçamento.",
      );
    }

    const kind =
      id === "etapas"
        ? "stages"
        : id === "inicio"
          ? "startDocs"
          : id === "conclusao"
            ? "endDocs"
            : null;

    if (kind) {
      for (
        const item of draft[kind]
      ) {
        const old = work[kind].find(
          (previous) =>
            previous.id === item.id,
        );

        const automatic =
          kind === "stages" &&
          [
            "Checklist de Início de Obra",
            "Checklist de Conclusão de Obra",
          ].includes(item.name);

        if (
          !automatic &&
          JSON.stringify(old) !==
            JSON.stringify(item) &&
          item.status === "CADASTRADO"
        ) {
          errors.push(
            item.name +
              ": selecione outro status.",
          );
        }

        if (
          item.start &&
          item.end &&
          !validRange(
            item.start,
            item.end,
          )
        ) {
          errors.push(
            item.name +
              ": período inválido.",
          );
        }
      }
    }

    if (errors.length) {
      setError(errors.join(" "));
      return;
    }

    const keys: Record<
      string,
      (keyof Work)[]
    > = {
      croqui: [
        "points",
        "lines",
        "segments",
      ],
      orcamento: ["budget"],
      etapas: ["stages"],
      inicio: ["startDocs"],
      conclusao: ["endDocs"],
      fotos: ["reports"],
    };

    const fields =
      keys[id] ||
      (
        Object.keys(draft).filter(
          (field) =>
            ![
              "stages",
              "startDocs",
              "endDocs",
              "points",
              "lines",
              "segments",
              "budget",
              "reports",
            ].includes(field),
        ) as (keyof Work)[]
      );

    const patch = Object.fromEntries(
      fields.map(
        (field) => [
          field,
          draft[field],
        ],
      ),
    );

    try {
      await save({
        ...work,
        ...patch,
        ...(
          id === "dados"
            ? { dataValidated: true }
            : {}
        ),
      });
    } catch (failure) {
      setError(String(failure));
      return;
    }

    setDraft(null);
    setRecoverable(null);
    void saveDraft(key, null);
    setError("");
  };

  return (
    <>
      <div className="section-head">
        {recoverable && !draft && (
          <button
            onClick={() =>
              setDraft(recoverable)
            }
          >
            Restaurar edição local
          </button>
        )}

        {id !== "cronograma" &&
          (
            draft ? (
              <>
                <button
                  className="primary"
                  onClick={finish}
                >
                  Confirmar alterações
                </button>

                <button
                  onClick={() => {
                    setDraft(null);
                    setRecoverable(null);
                    void saveDraft(key, null);
                    setError("");
                  }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  setDraft(
                    structuredClone(work),
                  )
                }
              >
                EDITAR
              </button>
            )
          )}
      </div>

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      <div
        className={
          draft
            ? ""
            : "consultation"
        }
      >
        <fieldset
          disabled={
            !draft &&
            id !== "cronograma" &&
            id !== "croqui" &&
            id !== "fotos" &&
            ![
              "etapas",
              "inicio",
              "conclusao",
            ].includes(id)
          }
        >
          {children(
            draft || work,
            (patch) =>
              setDraft(
                (current) =>
                  current
                    ? (
                        typeof patch ===
                          "function"
                          ? patch(current)
                          : {
                              ...current,
                              ...patch,
                            }
                      )
                    : current,
              ),
            !!draft,
          )}
        </fieldset>
      </div>
    </>
  );
}
