type JsonRecord = Record<string, unknown>;
const object = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
const containsId = (value: unknown, id: string) =>
  Array.isArray(value) && value.some((item) => object(item)?.id === id);

export const isFileId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// IDs em observações, títulos ou substrings não autorizam um upload.
export function isLinkedFile(entity: unknown, id: string, kind: string) {
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
