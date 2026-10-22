import { supabase } from "../data";

import {
  uid,
  type Work,
  type User,
} from "../model";

import {
  classifySyncError,
} from "./syncPolicy";

import {
  toReferenceReport,
} from "./reportModel";

type LocalFile = {
  id: string;
  owner: string;
  workId: string;
  entityId: string;
  kind: string;
  name: string;
  mime: string;
  blob: Blob;
  status:
    | "pending"
    | "uploaded"
    | "error";
  attempts: number;
  nextTry: number;
  blocked?: boolean;
  error?: string;
};

let database:
  Promise<IDBDatabase> | undefined;

let running = false;

const listeners = new Set<
  () => void
>();

const db = () =>
  (
    database ??= new Promise<IDBDatabase>(
      (resolve, reject) => {
        const operation = indexedDB.open(
          "sgo-files-v1",
          1,
        );

        operation.onupgradeneeded = () => {
          operation.result.createObjectStore(
            "files",
            { keyPath: "id" },
          );
        };

        operation.onsuccess = () =>
          resolve(operation.result);

        operation.onerror = () =>
          reject(operation.error);
      },
    )
  );

async function store(value: LocalFile) {
  const connection = await db();

  await new Promise<void>(
    (resolve, reject) => {
      const transaction =
        connection.transaction(
          "files",
          "readwrite",
        );

      transaction
        .objectStore("files")
        .put(value);

      transaction.oncomplete = () =>
        resolve();

      transaction.onerror = () =>
        reject(transaction.error);
    },
  );

  listeners.forEach(
    (listener) => listener(),
  );
}

async function all() {
  const connection = await db();

  return new Promise<LocalFile[]>(
    (resolve, reject) => {
      const operation = connection
        .transaction("files")
        .objectStore("files")
        .getAll();

      operation.onsuccess = () =>
        resolve(operation.result);

      operation.onerror = () =>
        reject(operation.error);
    },
  );
}

async function owner() {
  return supabase
    ? (
        await supabase.auth.getSession()
      ).data.session?.user.id || ""
    : "local";
}

export async function enqueueFile(
  workId: string,
  entityId: string,
  kind: string,
  file: File,
) {
  if (
    file.size > 15 * 1024 * 1024
  ) {
    throw new Error(
      "Limite de 15 MB por arquivo.",
    );
  }

  const quota =
    await navigator.storage?.estimate();

  if (
    quota?.quota &&
    quota.usage &&
    quota.quota - quota.usage <
      file.size * 1.2
  ) {
    throw new Error(
      "Espaço local insuficiente.",
    );
  }

  const id = uid();
  const currentOwner = await owner();

  if (!currentOwner) {
    throw new Error("Sessão inválida");
  }

  await store({
    id,
    owner: currentOwner,
    workId,
    entityId,
    kind,
    name: file.name,
    mime: file.type,
    blob: file,
    status: "pending",
    attempts: 0,
    nextTry: 0,
  });

  void flushFiles();

  return id;
}

export async function getFile(id: string) {
  const currentOwner = await owner();
  if (!currentOwner) throw new Error("Sessão inválida");
  const local = (await all()).find(
    (file) => file.id === id && file.owner === currentOwner,
  );
  const assertOwner = async () => {
    if ((await owner()) !== currentOwner) {
      throw new Error("Sessão alterada durante o download. Entre novamente.");
    }
  };
  await assertOwner();
  if (local) return local.blob;
  if (!supabase) throw new Error("Arquivo não disponível");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || session.user.id !== currentOwner)
    throw new Error("Sessão inválida");
  const response = await fetch(
    import.meta.env.VITE_SUPABASE_URL + "/functions/v1/drive-files",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + session.access_token,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "download", id }),
    },
  );
  if (!response.ok) throw new Error("Arquivo indisponível: " + response.status);
  const blob = await response.blob();
  await assertOwner();
  return blob;
}

export async function fileStatus() {
  const currentOwner = await owner();

  const files = (
    await all()
  ).filter(
    (file) =>
      file.owner === currentOwner,
  );

  return {
    pending: files.filter(
      (file) =>
        file.status !== "uploaded",
    ).length,

    errors: files
      .filter(
        (file) => file.error,
      )
      .map(
        (file) =>
          file.name +
          ": " +
          file.error,
      ),
  };
}

export function watchFiles(
  listener: () => void,
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function flushFiles() {
  if (
    running ||
    !supabase ||
    !navigator.onLine
  ) {
    return;
  }

  running = true;

  try {
    const currentOwner = await owner();

    for (
      const file of await all()
    ) {
      if (
        file.owner !== currentOwner ||
        file.status === "uploaded" ||
        file.blocked ||
        file.nextTry > Date.now()
      ) {
        continue;
      }

      try {
        const {
          data: work,
          error: workError,
        } = await supabase
          .from("obras")
          .select("id,payload")
          .eq("id", file.workId)
          .maybeSingle();

        if (workError) {
          throw workError;
        }

        // Aguarda a sincronização da obra.
        if (!work) {
          continue;
        }

        const payload =
          work.payload as Work;

        const entity =
          [
            ...payload.reports,
            ...payload.stages,
            ...payload.startDocs,
            ...payload.endDocs,
          ].find(
            (item) =>
              item.id === file.entityId,
          ) ||
          (
            file.entityId === file.workId
              ? payload
              : null
          );

        if (!entity) {
          continue;
        }

        // Aguarda a confirmação do vínculo
        // antes de enviar o binário.
        if (
          file.kind !== "pdf" &&
          !JSON.stringify(entity)
            .includes(file.id)
        ) {
          continue;
        }

        if (
          await owner() !== currentOwner
        ) {
          break;
        }

        const body = new FormData();

        body.append("id", file.id);
        body.append("workId", file.workId);
        body.append("entityId", file.entityId);
        body.append("kind", file.kind);
        body.append(
          "file",
          file.blob,
          file.name,
        );

        const { data, error } =
          await supabase.functions.invoke(
            "drive-files",
            { body },
          );

        if (error) {
          const response = (
            error as {
              context?: Response;
            }
          ).context;

          let message = error.message;

          if (
            response instanceof Response
          ) {
            try {
              const details =
                await response
                  .clone()
                  .json();

              message =
                details.error || message;
            } catch {
              // Mantém a mensagem original
              // quando a resposta não for JSON.
            }

            const transient =
              /Drive HTTP (429|5\d\d)|fetch|timeout|network/i
                .test(message);

            throw Object.assign(
              new Error(message),
              {
                status: transient
                  ? 503
                  : response.status,
              },
            );
          }

          throw error;
        }

        if (
          data?.status !== "uploaded" ||
          !data?.drive_id
        ) {
          throw new Error(
            "Upload não confirmado",
          );
        }

        // Só confirma depois do retorno
        // do Drive e dos metadados no banco.
        await store({
          ...file,
          status: "uploaded",
          error: undefined,
        });
      } catch (error) {
        file.attempts++;

        file.error =
          (
            error as {
              message?: string;
            }
          )?.message ||
          String(error);

        file.status = "error";

        file.blocked =
          classifySyncError(error) ===
          "blocked";

        file.nextTry =
          Date.now() +
          Math.min(
            300000,
            2000 *
              2 ** Math.min(
                file.attempts,
                8,
              ),
          );

        await store(file);
      }
    }
  } finally {
    running = false;
  }
}

export function startFiles() {
  const timer = setInterval(
    () => void flushFiles(),
    15000,
  );

  window.addEventListener(
    "online",
    flushFiles,
  );

  void flushFiles();

  return () => {
    clearInterval(timer);

    window.removeEventListener(
      "online",
      flushFiles,
    );
  };
}

export async function externalizeReportFiles(
  work: Work,
  users: User[],
  previous?: Work,
): Promise<Work> {
  const result = structuredClone(work);

  for (
    const report of result.reports
  ) {
    const old = previous?.reports.find(
      (item) => item.id === report.id,
    );

    // Preserva relatórios concluídos
    // que não foram alterados.
    if (
      old?.status === "CONCLUÍDO" &&
      JSON.stringify(old) ===
        JSON.stringify(report)
    ) {
      continue;
    }

    const reference = toReferenceReport(
      report,
      result,
      users,
    );

    let migrated = false;

    const files = [
      ...reference.fotos.flatMap(
        (photo) =>
          photo.imagem
            ? [photo.imagem]
            : [],
      ),
      ...reference.anexos,
    ];

    for (const file of files) {
      if (
        file.data.startsWith("data:")
      ) {
        const blob = await (
          await fetch(file.data)
        ).blob();

        file.id = await enqueueFile(
          result.id,
          report.id,
          file.type.startsWith("image/")
            ? "photo"
            : "attachment",
          new File(
            [blob],
            file.name,
            { type: file.type },
          ),
        );

        file.data = "";
        migrated = true;
      }
    }

    if (
      migrated ||
      report.reference
    ) {
      report.reference = reference;
      report.photos = [];
    }
  }

  return result;
}

export async function retryFileErrors() {
  for (
    const file of await all()
  ) {
    if (
      file.owner === await owner() &&
      file.status === "error"
    ) {
      await store({
        ...file,
        blocked: false,
        error: undefined,
        nextTry: 0,
      });
    }
  }

  void flushFiles();
}
