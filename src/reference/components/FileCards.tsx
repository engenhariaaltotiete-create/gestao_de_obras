import type {
  StoredFile,
} from "../types";

import {
  MemoryTextInput,
} from "./MemoryTextInput";

type Props = {
  files: StoredFile[];
  onDescription: (
    index: number,
    text: string,
  ) => void;
  onRemove: (
    index: number,
  ) => void;
  onTitle?: (
    index: number,
    text: string,
  ) => void;
  titleRequired?: boolean;
  descriptionRequired?: boolean;
};

export function FileCards({
  files,
  onDescription,
  onRemove,
  onTitle,
  titleRequired,
  descriptionRequired,
}: Props) {
  if (!files.length) {
    return (
      <div className="empty">
        Nenhum arquivo adicionado.
      </div>
    );
  }

  return (
    <div className="file-grid">
      {files.map(
        (file, index) => {
          const canPreview =
            file.type.startsWith(
              "image/",
            ) &&
            !/tiff?/i.test(file.type);

          return (
            <article
              className="file-card"
              key={file.id}
            >
              {canPreview ? (
                <img
                  src={file.data}
                  alt={
                    file.titulo ||
                    file.name
                  }
                />
              ) : (
                <div className="file-placeholder">
                  {file.name}

                  <small>
                    {file.type ||
                      "arquivo"}
                  </small>
                </div>
              )}

              <div className="file-name">
                {file.name}
              </div>

              {onTitle && (
                <MemoryTextInput
                  label="Título"
                  value={
                    file.titulo || ""
                  }
                  required={
                    titleRequired
                  }
                  memoryKey="anexo_titulo"
                  onChange={(text) =>
                    onTitle(
                      index,
                      text,
                    )
                  }
                />
              )}

              <label className="field">
                <span>
                  Descrição

                  {descriptionRequired && (
                    <b className="required">
                      {" "}*
                    </b>
                  )}
                </span>

                <textarea
                  required={
                    descriptionRequired
                  }
                  value={
                    file.descricao
                  }
                  onChange={(event) =>
                    onDescription(
                      index,
                      event.target.value,
                    )
                  }
                />
              </label>

              <button
                type="button"
                className="ghost danger-text"
                onClick={() =>
                  onRemove(index)
                }
              >
                Remover
              </button>
            </article>
          );
        },
      )}
    </div>
  );
}
