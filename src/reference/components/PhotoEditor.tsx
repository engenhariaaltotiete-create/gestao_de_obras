import type {
  PhotoReport,
  StoredFile,
} from "../types";

import {
  BASE_OPTIONS,
  PHOTO_OPTIONS,
} from "../data/options";

import {
  EditableListInput,
} from "./EditableListInput";

import {
  MemoryTextInput,
} from "./MemoryTextInput";

import {
  FileCards,
} from "./FileCards";

import {
  blankPhotoEntry,
} from "../lib/helpers";

export const PHOTO_OBJECTIVES:
  Record<string, string> = {
  "PRÉ-OBRA":
    "Registrar as condições existentes da área de intervenção e de suas adjacências antes do início dos serviços, por meio de levantamento fotográfico, visando documentar o estado de conservação de pavimentos, calçadas, guias, sarjetas, dispositivos urbanos, imóveis lindeiros e demais elementos que possam ser influenciados pela execução da obra.",

  "ACOMPANHAMENTO DE OBRA":
    "Registrar a evolução física dos serviços durante a execução da obra, por meio de acompanhamento fotográfico das etapas construtivas, das frentes de trabalho, das condições operacionais e das soluções adotadas, possibilitando o controle, monitoramento e rastreabilidade das atividades executadas.",

  "FINAL DE OBRA":
    "Registrar a situação da área após a conclusão dos serviços, evidenciando a execução do objeto contratado, a recomposição das áreas afetadas, a restauração das condições operacionais do local e o atendimento às condições previstas para encerramento da intervenção.",

  "OCORRÊNCIAS":
    "Registrar e documentar fatos, eventos, não conformidades, interferências, emergências, danos, solicitações de terceiros ou quaisquer situações relevantes identificadas durante as atividades, fornecendo evidências para análise técnica, tomada de decisão, controle contratual e eventual instrução de processos administrativos ou judiciais.",

  "SINISTRO":
    "Registrar e documentar, por meio de levantamento fotográfico, os fatos, condições, danos, avarias, impactos e demais evidências relacionados à ocorrência de sinistro, visando caracterizar a situação reclamada, identificar os elementos afetados, subsidiar análises técnicas, apuração de responsabilidades, avaliação de prejuízos, definição de ações corretivas e mitigadoras, bem como fornecer suporte documental para processos administrativos, contratuais, securitários, judiciais ou extrajudiciais.",
};

type Props = {
  report: PhotoReport;
  onChange: (
    report: PhotoReport,
  ) => void;
  onSaveBack: () => void;
  onPdf: () => void;
  onExport: () => void;
  busy: boolean;
  storeFile: (
    file: File,
  ) => Promise<StoredFile>;
};

export function PhotoEditor({
  report: r,
  onChange,
  onSaveBack,
  onPdf,
  onExport,
  busy,
  storeFile,
}: Props) {
  const set = (
    patch: Partial<PhotoReport>,
  ) =>
    onChange({
      ...r,
      ...patch,
      updatedAt:
        new Date().toISOString(),
    });

  const resp = (
    key: keyof PhotoReport["responsavel"],
    value: string,
  ) =>
    set({
      responsavel: {
        ...r.responsavel,
        [key]: value,
      },
    });

  const obra = (
    key: keyof PhotoReport["obra"],
    value: string,
  ) =>
    set({
      obra: {
        ...r.obra,
        [key]: value,
      },
    });

  const choosePhoto = async (
    index: number,
    file?: File,
  ) => {
    if (!file) {
      return;
    }

    const stored = await storeFile(file);

    const fotos = [...r.fotos];

    fotos[index] = {
      ...fotos[index],
      imagem: stored,
    };

    set({ fotos });
  };

  return (
    <main className="container">
      <div className="page-heading">
        <div>
          <h2>
            Relatório Fotográfico
          </h2>

          <p>
            Preencha os blocos abaixo.
            Campos com * são obrigatórios.
          </p>
        </div>
      </div>

      <section className="card">
        <h3>
          1. Caracterização do relatório
        </h3>

        <div className="card-body form-grid">
          <EditableListInput
            label="Tipo de relatório"
            value={
              r.caracterizacao.tipoRelatorio
            }
            options={
              PHOTO_OPTIONS.tipoRelatorio
            }
            required
            allowCustom={false}
            onChange={(value) =>
              set({
                caracterizacao: {
                  ...r.caracterizacao,
                  tipoRelatorio: value,
                },
              })
            }
          />

          <label className="field full">
            <span>
              Informação complementar do relatório
            </span>

            <textarea
              className="long-text"
              placeholder="Se entender ser necessário explicar a motivação do relatório"
              value={
                r.caracterizacao.informacaoComplementar
              }
              onChange={(event) =>
                set({
                  caracterizacao: {
                    ...r.caracterizacao,
                    informacaoComplementar:
                      event.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="card objective-card">
        <h3>
          2. Objetivo
        </h3>

        <div className="card-body">
          <p className="objective-text">
            {
              PHOTO_OBJECTIVES[
                r.caracterizacao.tipoRelatorio
              ] ||
              "Selecione o Tipo de relatório para definir automaticamente o objetivo."
            }
          </p>
        </div>
      </section>

      <section className="card">
        <h3>
          3. Identificação do responsável
          pela elaboração do relatório
        </h3>

        <div className="card-body form-grid">
          <label className="field">
            <span>
              Elaborado por
              {" "}
              <b className="required">
                *
              </b>
            </span>

            <input
              required
              readOnly
              value={
                r.responsavel.elaboradoPor
              }
              placeholder="Selecione o responsável cadastrado no relatório"
            />
          </label>

          <label className="field">
            <span>
              Data
              {" "}
              <b className="required">
                *
              </b>
            </span>

            <input
              type="date"
              value={
                r.responsavel.data
              }
              onChange={(event) =>
                resp(
                  "data",
                  event.target.value,
                )
              }
            />
          </label>

          <MemoryTextInput
            label="Matrícula"
            value={
              r.responsavel.matricula
            }
            required
            memoryKey="matricula"
            onChange={(value) =>
              resp("matricula", value)
            }
          />

          <EditableListInput
            label="Cargo/Função"
            value={
              r.responsavel.cargo
            }
            options={
              BASE_OPTIONS.cargo
            }
            required
            onChange={(value) =>
              resp("cargo", value)
            }
          />

          <MemoryTextInput
            label="Empresa"
            value={
              r.responsavel.empresa
            }
            required
            memoryKey="empresa"
            onChange={(value) =>
              resp("empresa", value)
            }
          />
        </div>
      </section>

      <section className="card">
        <h3>
          4. Dados da Obra
        </h3>

        <div className="card-body form-grid">
          <EditableListInput
            label="Município"
            value={r.obra.municipio}
            options={
              BASE_OPTIONS.municipio
            }
            required
            onChange={(value) =>
              obra("municipio", value)
            }
          />

          <MemoryTextInput
            label="Endereço"
            value={r.obra.endereco}
            required
            memoryKey="endereco"
            onChange={(value) =>
              obra("endereco", value)
            }
          />

          <EditableListInput
            label="Tipo de Serviço"
            value={r.obra.tipoObra}
            options={
              PHOTO_OPTIONS.tipoObra
            }
            required
            allowCustom={false}
            onChange={(value) =>
              obra("tipoObra", value)
            }
          />

          <EditableListInput
            label="Água/Esgoto"
            value={r.obra.aguaEsgoto}
            options={
              BASE_OPTIONS.aguaEsgoto
            }
            required
            allowCustom={false}
            onChange={(value) =>
              obra("aguaEsgoto", value)
            }
          />

          <MemoryTextInput
            label="Empresa Executora"
            value={
              r.obra.empresaExecutora
            }
            required
            memoryKey="empresa_executora"
            onChange={(value) =>
              obra(
                "empresaExecutora",
                value,
              )
            }
          />

          <MemoryTextInput
            label="Contrato"
            value={r.obra.contrato}
            required
            memoryKey="contrato"
            onChange={(value) =>
              obra("contrato", value)
            }
          />

          <label className="field full">
            <span>
              Descrição complementar da obra
            </span>

            <textarea
              className="long-text"
              placeholder="Informações adicionais para melhor caracterização da obra"
              value={
                r.obra.descricaoComplementar
              }
              onChange={(event) =>
                obra(
                  "descricaoComplementar",
                  event.target.value,
                )
              }
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h3>
          5. Observações gerais da vistoria
        </h3>

        <div className="card-body">
          <label className="field">
            <span>
              Observações
            </span>

            <textarea
              className="long-text"
              value={
                r.observacoesGerais
              }
              onChange={(event) =>
                set({
                  observacoesGerais:
                    event.target.value,
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h3>
          6. Relatório fotográfico
        </h3>

        <div className="card-body">
          {r.fotos.map(
            (foto, index) => (
              <article
                className="evidence-card"
                key={foto.id}
              >
                <div className="evidence-head">
                  <strong>
                    Foto
                    {" "}
                    {String(index + 1)
                      .padStart(2, "0")}
                  </strong>

                  {r.fotos.length > 1 && (
                    <button
                      className="danger"
                      type="button"
                      onClick={() =>
                        set({
                          fotos:
                            r.fotos.filter(
                              (_, position) =>
                                position !==
                                index,
                            ),
                        })
                      }
                    >
                      Remover
                    </button>
                  )}
                </div>

                <div className="card-body form-grid">
                  <MemoryTextInput
                    label="Título"
                    required
                    value={foto.titulo}
                    memoryKey="foto_titulo"
                    onChange={(value) => {
                      const fotos =
                        [...r.fotos];

                      fotos[index] = {
                        ...foto,
                        titulo: value,
                      };

                      set({ fotos });
                    }}
                  />

                  <label className="field full">
                    <span>
                      Descrição
                    </span>

                    <textarea
                      value={
                        foto.descricao
                      }
                      onChange={(event) => {
                        const fotos =
                          [...r.fotos];

                        fotos[index] = {
                          ...foto,
                          descricao:
                            event.target.value,
                        };

                        set({ fotos });
                      }}
                    />
                  </label>

                  <label className="file-button secondary">
                    Selecionar imagem

                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        void choosePhoto(
                          index,
                          event.target
                            .files?.[0],
                        ).catch(
                          (error) =>
                            alert(
                              String(error),
                            ),
                        );

                        event.currentTarget.value =
                          "";
                      }}
                    />
                  </label>

                  <label className="file-button secondary">
                    Abrir câmera

                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => {
                        void choosePhoto(
                          index,
                          event.target
                            .files?.[0],
                        ).catch(
                          (error) =>
                            alert(
                              String(error),
                            ),
                        );

                        event.currentTarget.value =
                          "";
                      }}
                    />
                  </label>

                  {foto.imagem && (
                    <div className="file-card full">
                      <img
                        src={
                          foto.imagem.data
                        }
                        alt={
                          foto.titulo ||
                          foto.imagem.name
                        }
                      />

                      <div className="file-name">
                        {foto.imagem.name}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ),
          )}

          <button
            type="button"
            onClick={() =>
              set({
                fotos: [
                  ...r.fotos,
                  blankPhotoEntry(),
                ],
              })
            }
          >
            + Adicionar foto
          </button>
        </div>
      </section>

      <section className="card">
        <h3>
          7. Anexos
        </h3>

        <div className="card-body">
          <div className="actions">
            <label className="file-button secondary">
              Adicionar anexos

              <input
                hidden
                multiple
                type="file"
                accept="image/*,.pdf,.tif,.tiff,application/pdf"
                onChange={async (event) => {
                  const input =
                    event.currentTarget;

                  const files = Array.from(
                    input.files || [],
                  );

                  try {
                    const added =
                      await Promise.all(
                        files.map(storeFile),
                      );

                    set({
                      anexos: [
                        ...r.anexos,
                        ...added,
                      ],
                    });
                  } catch (error) {
                    alert(
                      String(error),
                    );
                  } finally {
                    input.value = "";
                  }
                }}
              />
            </label>
          </div>

          <FileCards
            files={r.anexos}
            titleRequired
            descriptionRequired
            onTitle={(index, text) => {
              const anexos =
                [...r.anexos];

              anexos[index] = {
                ...anexos[index],
                titulo: text,
              };

              set({ anexos });
            }}
            onDescription={(index, text) => {
              const anexos =
                [...r.anexos];

              anexos[index] = {
                ...anexos[index],
                descricao: text,
              };

              set({ anexos });
            }}
            onRemove={(index) =>
              set({
                anexos:
                  r.anexos.filter(
                    (_, position) =>
                      position !== index,
                  ),
              })
            }
          />
        </div>
      </section>

      <div className="editor-bar">
        <button
          className="secondary"
          onClick={onSaveBack}
        >
          Salvar e voltar
        </button>

        <button
          className="secondary"
          onClick={onExport}
        >
          Exportar JSON
        </button>

        <button
          onClick={onPdf}
          disabled={busy}
        >
          {busy
            ? "Gerando PDF..."
            : "Gerar PDF"}
        </button>
      </div>
    </main>
  );
}
