import test from "node:test";
import assert from "node:assert/strict";
import {
  isFileId,
  isLinkedFile,
} from "../supabase/functions/_shared/file-links.ts";
const id = "00000000-0000-4000-8000-000000000001";

test("IDs de arquivo exigem UUID inteiro, sem aceitar sequências de hífens", () => {
  assert.equal(isFileId(id), true);
  assert.equal(isFileId("-".repeat(36)), false);
  assert.equal(isFileId(null), false);
});
test("vínculo de arquivo usa campos próprios e nunca observações ou substrings", () => {
  assert.equal(isLinkedFile({ note: id }, id, "photo"), false);
  assert.equal(
    isLinkedFile({ attachments: [{ id: "prefix-" + id }] }, id, "document"),
    false,
  );
  assert.equal(isLinkedFile({ attachments: [{ id }] }, id, "document"), true);
  assert.equal(
    isLinkedFile({ reference: { fotos: [{ imagem: { id } }] } }, id, "photo"),
    true,
  );
  assert.equal(
    isLinkedFile({ reference: { anexos: [{ id }] } }, id, "attachment"),
    true,
  );
  assert.equal(
    isLinkedFile(
      { reference: { anexos: [{ id, type: "image/png" }] } },
      id,
      "photo",
    ),
    true,
  );
  assert.equal(isLinkedFile({ photos: [{ id }] }, id, "photo"), true);
  assert.equal(isLinkedFile({ photos: [] }, id, "pdf"), true);
  assert.equal(isLinkedFile({ reports: [] }, id, "pdf"), false);
  assert.equal(isLinkedFile(undefined, id, "photo"), false);
  assert.equal(
    isLinkedFile(
      { reference: { fotos: [null, { imagem: null }] } },
      id,
      "photo",
    ),
    false,
  );
});
