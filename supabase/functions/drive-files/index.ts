import { createDriveTokenProvider } from "../_shared/google-oauth.ts";
import { isFileId, isLinkedFile } from "../_shared/file-links.ts";
import { authorize, cors, json, failure } from "../_shared/auth.ts";

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
