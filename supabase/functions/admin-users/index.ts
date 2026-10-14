import { authorize, cors, json, failure } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Método inválido" }, 405);
    }

    const { user, privileged } = await authorize(req, true);

    const body = await req.json();
    const { name, email, role, active, id } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !["admin", "user"].includes(role) ||
      typeof active !== "boolean" ||
      typeof email !== "string" ||
      !email.includes("@")
    ) {
      throw new Error("Dados inválidos");
    }

    if (id === user.id && (role !== "admin" || !active)) {
      throw new Error(
        "Não desative ou remova seu próprio perfil administrativo",
      );
    }

    let target = id;

    if (!id) {
      const { data, error } = await privileged.auth.admin.inviteUserByEmail(
        email,
        {
          data: { name },
          redirectTo: Deno.env.get("APP_URL"),
        },
      );

      if (error) throw error;

      target = data.user.id;
    }

    const { data: old } = await privileged
      .from("profiles")
      .select("*")
      .eq("id", target)
      .single();

    if (!old) {
      throw new Error("Perfil não encontrado");
    }

    if (old.role === "admin" && old.active && (role !== "admin" || !active)) {
      const { count } = await privileged
        .from("profiles")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("role", "admin")
        .eq("active", true);

      if ((count || 0) <= 1) {
        throw new Error("É necessário manter um administrador ativo");
      }
    }

    const { error } = await privileged.rpc("admin_update_profile", {
      p_id: target,
      p_name: name.trim(),
      p_role: role,
      p_active: active,
      p_actor: user.id,
    });

    if (error) throw error;

    if (!id) {
      const { error: auditError } = await privileged.rpc(
        "admin_audit_invitation",
        { p_id: target, p_actor: user.id },
      );
      if (auditError) throw auditError;
    }

    const { error: banError } = await privileged.auth.admin.updateUserById(
      target,
      {
        ban_duration: active ? "none" : "876000h",
      },
    );

    if (banError) throw banError;

    return json({
      ok: true,
      id: target,
    });
  } catch (e) {
    return failure(e);
  }
});
