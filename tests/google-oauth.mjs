import test from "node:test";
import assert from "node:assert/strict";
import { createDriveTokenProvider } from "../supabase/functions/_shared/google-oauth.ts";

const credentials = {
  GOOGLE_OAUTH_CLIENT_ID: "test-client",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-secret",
  GOOGLE_OAUTH_REFRESH_TOKEN: "test-refresh",
};
const getEnv = (name) => credentials[name];
const success = (token = "test-access") =>
  Response.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
  });

test("OAuth usa o refresh token no backend, compartilha renovação e respeita validade", async () => {
  let time = 1000;
  let requests = 0;
  const token = createDriveTokenProvider({
    getEnv,
    now: () => time,
    fetcher: async (url, init) => {
      requests++;
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(init.method, "POST");
      assert.deepEqual(Object.fromEntries(init.body), {
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "test-secret",
        refresh_token: "test-refresh",
      });
      return success("access-" + requests);
    },
  });
  assert.deepEqual(await Promise.all([token(), token(), token()]), [
    "access-1",
    "access-1",
    "access-1",
  ]);
  assert.equal(requests, 1);
  time += 3539 * 1000;
  assert.equal(await token(), "access-1");
  time += 1000;
  assert.equal(await token(), "access-2");
  assert.equal(requests, 2);
});

test("OAuth exige as três configurações antes de contatar Google", async () => {
  for (const missing of Object.keys(credentials)) {
    const token = createDriveTokenProvider({
      getEnv: (name) => (name === missing ? undefined : getEnv(name)),
      fetcher: async () => {
        assert.fail("Não deveria fazer requisição");
      },
    });
    await assert.rejects(token(), /OAuth não configurado/);
  }
});

test("OAuth não expõe resposta privada de erro e permite tentar após correção", async () => {
  for (const [error, expected] of [
    ["invalid_grant", /expirada ou revogada/],
    ["invalid_client", /Cliente OAuth.*inválido/],
    ["other", /Falha ao renovar/],
  ]) {
    let count = 0;
    const token = createDriveTokenProvider({
      getEnv,
      fetcher: async () => {
        if (count++ === 0)
          return Response.json(
            { error, error_description: "PRIVATE" },
            { status: 400 },
          );
        return success();
      },
    });
    await assert.rejects(
      token(),
      (e) => expected.test(e.message) && !e.message.includes("PRIVATE"),
    );
    assert.equal(await token(), "test-access");
  }
});

test("OAuth rejeita respostas inválidas e falhas de rede sem vazar detalhes", async () => {
  const fetchers = [
    async () => new Response("PRIVATE", { status: 502 }),
    async () => Response.json({ access_token: "test", expires_in: 3600 }),
    async () =>
      Response.json({ access_token: "test", token_type: 1, expires_in: 3600 }),
    async () =>
      Response.json({
        access_token: "test",
        token_type: "Bearer",
        expires_in: -1,
      }),
    async () => Response.json(null),
    async () => {
      throw new Error("PRIVATE");
    },
  ];
  for (const fetcher of fetchers) {
    const token = createDriveTokenProvider({ getEnv, fetcher });
    await assert.rejects(token(), (e) => !e.message.includes("PRIVATE"));
  }
});
