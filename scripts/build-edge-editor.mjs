import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("../supabase/", import.meta.url);
const shared = await Promise.all(
  ["auth.ts", "google-oauth.ts", "file-links.ts"].map((name) =>
    readFile(new URL("functions/_shared/" + name, root), "utf8"),
  ),
);
const source = await readFile(
  new URL("functions/drive-files/index.ts", root),
  "utf8",
);
const body = source.replace(
  /^import\s+[\s\S]*?\s+from\s+["']\.\.?\/[^"']+["'];?\n/gm,
  "",
);
const text =
  "// Gerado por scripts/build-edge-editor.mjs para colar no editor do Supabase.\n// Credenciais são lidas dos secrets; nunca cole valores neste arquivo.\n\n" +
  shared.map((s) => s.replace(/^export /gm, "")).join("\n") +
  "\n" +
  body;
await mkdir(new URL("deploy/", root), { recursive: true });
await writeFile(new URL("deploy/drive-files-editor.ts", root), text);
console.log("Gerado supabase/deploy/drive-files-editor.ts");
