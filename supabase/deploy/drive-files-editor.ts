// Gerado por scripts/build-edge-editor.mjs para colar no editor do Supabase.
// Credenciais são lidas dos secrets; nunca cole valores neste arquivo.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

async function authorize(
  req: Request,
  admin = false,
) {
  const authorization = req.headers.get("Authorization");

  if (!authorization) {
    throw new Error("401: Autenticação obrigatória");
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("401: Sessão inválida");
  }

  const privileged = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile } = await privileged
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (
    !profile?.active ||
    (admin && profile.role !== "admin")
  ) {
    throw new Error("403: Permissão negada");
  }

  return {
    user,
    profile,
    client,
    privileged,
  };
}

function failure(e: unknown) {
  const message = String(e);

  return json(
    { error: message },
    message.includes("401:")
      ? 401
      : message.includes("403:")
        ? 403
        : 400,
  );
}

type Options = {
  getEnv: (name: string) => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
};

// Um provedor por instância da função; requisições concorrentes compartilham
// a renovação. Tokens e respostas do Google nunca são enviados ao frontend.
function createDriveTokenProvider({
  getEnv,
  fetcher = fetch,
  now = Date.now,
}: Options) {
  let accessToken = "";
  let expires = 0;
  let pending: Promise<string> | undefined;

  async function refresh() {
    const clientId = getEnv("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = getEnv("GOOGLE_OAUTH_CLIENT_SECRET");
    const refreshToken = getEnv("GOOGLE_OAUTH_REFRESH_TOKEN");

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Google Drive OAuth não configurado nos secrets do Supabase",
      );
    }

    const requestedAt = now();
    let response: Response;
    try {
      response = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(
        "Não foi possível renovar a conexão com o Google Drive; tente novamente",
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Resposta inválida ao renovar a conexão com o Google Drive",
      );
    }

    if (!response.ok) {
      // Não repassar error_description, corpo ou credenciais ao chamador.
      if (data?.error === "invalid_grant") {
        throw new Error(
          "Autorização do Google Drive expirada ou revogada; gere um novo refresh token",
        );
      }
      if (data?.error === "invalid_client") {
        throw new Error(
          "Cliente OAuth do Google Drive inválido; confira os secrets do Supabase",
        );
      }
      throw new Error("Falha ao renovar a conexão com o Google Drive");
    }

    if (
      typeof data?.access_token !== "string" ||
      !data.access_token ||
      typeof data.token_type !== "string" ||
      data.token_type.toLowerCase() !== "bearer" ||
      typeof data.expires_in !== "number" ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    ) {
      throw new Error(
        "Resposta inválida ao renovar a conexão com o Google Drive",
      );
    }

    accessToken = data.access_token;
    expires = requestedAt + Math.max(0, data.expires_in - 60) * 1000;
    return accessToken;
  }

  return async function token(): Promise<string> {
    if (accessToken && now() < expires) return accessToken;
    if (!pending) {
      pending = refresh().finally(() => {
        pending = undefined;
      });
    }
    return await pending;
  };
}

type JsonRecord = Record<string, unknown>;
const object = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
const containsId = (value: unknown, id: string) =>
  Array.isArray(value) && value.some((item) => object(item)?.id === id);

const isFileId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// IDs em observações, títulos ou substrings não autorizam um upload.
function isLinkedFile(entity: unknown, id: string, kind: string) {
  const record = object(entity);
  if (!record) return false;
  if (kind === "pdf") return Array.isArray(record.photos);
  if (!["photo", "attachment", "document"].includes(kind)) return false;
  if (containsId(record.attachments, id)) return true;
  if (kind === "document") return false;
  const reference = object(record.reference);
  if (containsId(reference?.anexos, id)) return true;
  return (
    kind === "photo" &&
    (containsId(record.photos, id) ||
      (Array.isArray(reference?.fotos) &&
        reference.fotos.some(
          (entry) => object(object(entry)?.imagem)?.id === id,
        )))
  );
}


const base = "https://www.googleapis.com/drive/v3/files";

// Credenciais OAuth pertencem somente aos secrets da Edge Function.
const token = createDriveTokenProvider({
  getEnv: (name) => Deno.env.get(name),
});

async function drive(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: "Bearer " + (await token()),
    },
  });

  if (!res.ok) {
    throw new Error("Drive HTTP " + res.status);
  }

  return res;
}

async function folder(name: string, parent: string) {
  const q =
    `'${parent.replace(/'/g, "\\'")}' in parents ` +
    `and name = '${name.replace(/'/g, "\\'")}' ` +
    "and mimeType = 'application/vnd.google-apps.folder' " +
    "and trashed = false";

  const existing = await (
    await drive(
      base +
        "?supportsAllDrives=true" +
        "&includeItemsFromAllDrives=true" +
        "&q=" +
        encodeURIComponent(q) +
        "&fields=files(id)",
    )
  ).json();

  if (existing.files[0]) {
    return existing.files[0].id;
  }

  const created = await (
    await drive(base + "?supportsAllDrives=true", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        parents: [parent],
        mimeType: "application/vnd.google-apps.folder",
      }),
    })
  ).json();

  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: cors,
    });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Método inválido" }, 405);
    }

    const { user, profile, client, privileged } = await authorize(req);

    const contentType = req.headers.get("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const id = String(form.get("id"));
      const workId = String(form.get("workId"));
      const entityId = String(form.get("entityId"));
      const kind = String(form.get("kind"));

      if (
        !(file instanceof File) ||
        file.size > 15 * 1024 * 1024 ||
        !["photo", "document", "pdf", "attachment"].includes(kind) ||
        !isFileId(id) ||
        !isFileId(workId) ||
        !entityId ||
        entityId.length > 255
      ) {
        throw new Error("Arquivo ou metadados inválidos (máximo 15 MB)");
      }

      const { data: work, error: workError } = await client
        .from("obras")
        .select("id,payload")
        .eq("id", workId)
        .single();

      if (workError || !work) {
        throw new Error("403: Obra indisponível");
      }

      if (
        profile.role !== "admin" &&
        work.payload.reports?.some(
          (r: any) => r.id === entityId && r.status === "CONCLUÍDO",
        )
      ) {
        throw new Error("403: Relatório concluído");
      }

      const related =
        work.payload.reports?.find((r: any) => r.id === entityId) ||
        [
          ...work.payload.stages,
          ...work.payload.startDocs,
          ...work.payload.endDocs,
        ].find((item: any) => item.id === entityId);

      if (!related && entityId !== workId) {
        throw new Error("403: Entidade inexistente");
      }

      if (
        !isLinkedFile(
          related || (entityId === workId ? work.payload : null),
          id,
          kind,
        )
      ) {
        throw new Error("403: Arquivo não vinculado à entidade");
      }

      const { data: existing, error: existingError } = await privileged
        .from("drive_files")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (
        existing &&
        (existing.work_id !== workId ||
          existing.entity_id !== entityId ||
          existing.uploaded_by !== user.id)
      ) {
        throw new Error("403: Identificador pertence a outro envio");
      }

      if (existing?.status === "uploaded") {
        return json(existing);
      }

      const root = Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID");

      if (!root) {
        throw new Error("Pasta raiz do Drive não configurada");
      }

      const moduleFolder = await folder("Obras", root);

      const workFolder = await folder(workId, moduleFolder);

      const typeFolder = await folder(kind, workFolder);

      let driveId = existing?.drive_id;

      if (!driveId) {
        const generated = await (
          await drive(base + "/generateIds?count=1&space=drive")
        ).json();

        driveId = generated.ids[0];

        const { error } = await privileged
          .from("drive_files")
          .upsert(
            {
              id,
              work_id: workId,
              entity_id: entityId,
              kind,
              drive_id: driveId,
              folder_id: typeFolder,
              name: file.name,
              mime: file.type || "application/octet-stream",
              size: file.size,
              uploaded_by: user.id,
              status: "pending",
              updated_by: user.id,
            },
            { onConflict: "id", ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();

        if (error) throw error;

        // Uma reserva concorrente nunca pode ter seu dono/vínculo sobrescrito.
        const { data: reserved, error: reservationError } = await privileged
          .from("drive_files")
          .select("*")
          .eq("id", id)
          .single();
        if (reservationError) throw reservationError;
        if (
          !reserved ||
          reserved.work_id !== workId ||
          reserved.entity_id !== entityId ||
          reserved.uploaded_by !== user.id
        ) {
          throw new Error("403: Identificador pertence a outro envio");
        }
        driveId = reserved.drive_id;
      }

      // O ID reservado permite retentar sem criar
      // outro arquivo após perda da resposta do upload.

      let exists = false;

      try {
        await drive(base + "/" + driveId + "?supportsAllDrives=true&fields=id");

        exists = true;
      } catch (e) {
        if (!String(e).includes("404")) {
          throw e;
        }
      }

      if (!exists) {
        const boundary = "sgo-" + crypto.randomUUID();

        const metadata = JSON.stringify({
          id: driveId,
          name: file.name,
          parents: [typeFolder],
          appProperties: {
            sgoFileId: id,
          },
        });

        const mime = file.type || "application/octet-stream";

        const body = new Blob([
          `--${boundary}\r\n` +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            `${metadata}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: ${mime}\r\n\r\n`,
          file,
          `\r\n--${boundary}--`,
        ]);

        await drive(
          "https://www.googleapis.com/upload/drive/v3/files" +
            "?uploadType=multipart&supportsAllDrives=true",
          {
            method: "POST",
            headers: {
              "Content-Type": "multipart/related; boundary=" + boundary,
            },
            body,
          },
        );
      }

      const verified = await (
        await drive(
          base +
            "/" +
            driveId +
            "?supportsAllDrives=true" +
            "&fields=id,size,appProperties",
        )
      ).json();

      if (
        Number(verified.size) !== file.size ||
        verified.appProperties?.sgoFileId !== id
      ) {
        throw new Error("Drive não confirmou tamanho e identidade do arquivo");
      }

      const { data: metadata, error } = await privileged
        .from("drive_files")
        .update({
          status: "uploaded",
          updated_by: user.id,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return json(metadata);
    }

    const { action, id } = await req.json();

    if (!isFileId(id) || !["download", "delete"].includes(action)) {
      throw new Error("Operação ou identificador inválido");
    }

    const { data: metadata, error } = await client
      .from("drive_files")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !metadata || metadata.status !== "uploaded") {
      throw new Error("403: Arquivo indisponível");
    }

    if (action === "download") {
      const response = await drive(
        base + "/" + metadata.drive_id + "?alt=media&supportsAllDrives=true",
      );

      return new Response(response.body, {
        headers: {
          ...cors,
          "Content-Type": metadata.mime,
          "Content-Disposition": "attachment",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (action === "delete") {
      if (profile.role !== "admin") {
        throw new Error("403: Exclusão exclusiva do administrador");
      }

      await drive(base + "/" + metadata.drive_id + "?supportsAllDrives=true", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trashed: true,
        }),
      });

      const { error } = await privileged
        .from("drive_files")
        .update({
          status: "deleted",
          updated_by: user.id,
        })
        .eq("id", id);

      if (error) throw error;

      return json({ ok: true });
    }

    throw new Error("Operação inválida");
  } catch (e) {
    return failure(e);
  }
});
