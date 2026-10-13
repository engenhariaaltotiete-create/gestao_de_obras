import { createClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

export async function authorize(
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

export function failure(e: unknown) {
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
