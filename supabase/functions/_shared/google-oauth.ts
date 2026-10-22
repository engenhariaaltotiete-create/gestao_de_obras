type Options = {
  getEnv: (name: string) => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
};

// Um provedor por instância da função; requisições concorrentes compartilham
// a renovação. Tokens e respostas do Google nunca são enviados ao frontend.
export function createDriveTokenProvider({
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
