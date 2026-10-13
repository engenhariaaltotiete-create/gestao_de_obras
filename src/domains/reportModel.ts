import type {
  PhotoReport,
  Work,
  User,
} from "../model";

import type {
  PhotoReport as ReferenceReport,
} from "../reference/types";

export function toReferenceReport(
  report: PhotoReport,
  work: Work,
  users: User[],
): ReferenceReport {
  return (
    report.reference || {
      kind: "photo",
      version: 1,
      id: report.id,
      createdAt: work.createdAt,
      updatedAt: work.createdAt,
      generatedAt: null,
      archivedAt: null,

      caracterizacao: {
        tipoRelatorio:
          "ACOMPANHAMENTO DE OBRA",
        informacaoComplementar: "",
      },

      responsavel: {
        elaboradoPor:
          users.find(
            (user) =>
              user.id === report.responsible,
          )?.name || "",
        data: report.date,
        matricula: "",
        cargo: "",
        empresa: "",
      },

      obra: {
        municipio: work.city,
        endereco: work.address,
        tipoObra: work.service,
        aguaEsgoto: work.ae,
        empresaExecutora: "",
        contrato: "",
        descricaoComplementar: work.notes,
      },

      observacoesGerais: "",

      fotos: report.photos.map((photo) => ({
        id: photo.id,
        titulo: photo.caption,
        descricao: "",
        imagem: {
          id: photo.id,
          name: "Foto.jpg",
          type: "image/jpeg",
          data: photo.data,
          descricao: "",
        },
      })),

      anexos: [],
    }
  );
}
