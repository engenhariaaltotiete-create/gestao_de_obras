import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  newWork,
  uid,
  syncStages,
  type Work,
  type User,
  type Audit,
} from "./model.ts";

export const initialAuthPasswordFlow =
  typeof location !== "undefined" &&
  /type=(invite|recovery)/.test(location.hash);

const env = import.meta.env || {};

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key)
    : null;

const STORAGE = "sgo_works_v1";
const AUDIT = "sgo_audit_v1";

export const demoUser: User = {
  id: "demo-admin",
  name: "Administrador (demonstração)",
  email: "demo@local",
  role: "admin",
  active: true,
};

export function localWorks(): Work[] {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE) || "[]",
    );

    return Array.isArray(data)
      ? data
      : [];
  } catch {
    return [];
  }
}

export async function loadWorks(): Promise<Work[]> {
  if (!supabase) {
    return localWorks();
  }

  const rows: Work[] = [];

  // Lotes internos permitem carregar mais de
  // 1.000 obras sem paginação tradicional na interface.
  for (
    let offset = 0;
    ;
    offset += 500
  ) {
    const { data, error } = await supabase
      .from("obras")
      .select("payload,revision")
      .order("created_at", {
        ascending: false,
      })
      .order("id")
      .range(offset, offset + 499);

    if (error) {
      throw error;
    }

    rows.push(
      ...(data || []).map((row) =>
        Object.assign(
          syncStages(row.payload as Work),
          {
            __revision: row.revision,
          },
        ),
      ),
    );

    if (!data || data.length < 500) {
      break;
    }
  }

  return rows;
}

export async function persistWork(work: Work) {
  if (!supabase) {
    const works = localWorks();

    const index = works.findIndex(
      (item) => item.id === work.id,
    );

    if (index >= 0) {
      works[index] = work;
    } else {
      works.unshift(work);
    }

    localStorage.setItem(
      STORAGE,
      JSON.stringify(works),
    );

    return;
  }

  throw new Error(
    "Use a fila offline e o RPC com revisão para persistir obras.",
  );
}

export async function removeWork(id: string) {
  if (!supabase) {
    localStorage.setItem(
      STORAGE,
      JSON.stringify(
        localWorks().filter(
          (work) => work.id !== id,
        ),
      ),
    );

    return;
  }

  const { error } = await supabase
    .from("obras")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function loadUsers(): Promise<User[]> {
  if (!supabase) {
    return [demoUser];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,name,email,role,active,created_at",
    )
    .order("name");

  if (error) {
    throw error;
  }

  return (data as User[]) || [];
}

export async function loadAudit(): Promise<Audit[]> {
  if (!supabase) {
    try {
      return JSON.parse(
        localStorage.getItem(AUDIT) || "[]",
      );
    } catch {
      return [];
    }
  }

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id,work_id,entity,entity_id,field,old_value,new_value,actor_id,created_at",
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(2000);

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    workId: row.work_id || "",
    entity: row.entity,
    entityId: row.entity_id,
    field: row.field,
    before: JSON.stringify(row.old_value),
    after: JSON.stringify(row.new_value),
    actor: row.actor_id,
    at: row.created_at,
  }));
}

export function auditChanges(
  before: Work | undefined,
  after: Work,
  actor: string,
) {
  // Em produção, a auditoria é gerada pelo banco.
  if (supabase) {
    return;
  }

  const old = before
    ? JSON.stringify(before)
    : "";

  if (old === JSON.stringify(after)) {
    return;
  }

  const list: Audit[] = JSON.parse(
    localStorage.getItem(AUDIT) || "[]",
  );

  list.unshift({
    id: uid(),
    workId: after.id,
    entity: "obras",
    entityId: after.id,
    field: before ? "payload" : "CREATE",
    before: old,
    after: JSON.stringify(after),
    actor,
    at: new Date().toISOString(),
  });

  localStorage.setItem(
    AUDIT,
    JSON.stringify(list.slice(0, 500)),
  );
}

export function sampleWork() {
  const work = newWork();

  work.address = "Rua das Flores, 120";
  work.district = "Centro";
  work.city = "Suzano";
  work.service = "Prolongamento";
  work.ae = "Água";
  work.links = 18;
  work.png = 4;

  // Informação histórica da amostra.
  // O cálculo da extensão utiliza somente os trechos.
  work.manualLength = 245;

  work.stages[6].status = "EM ANDAMENTO";
  work.stages[6].start = "2026-10-01";
  work.stages[6].end = "2026-11-30";
  work.stages[6].statusAt =
    new Date().toISOString();

  return work;
}

export async function authenticatedProfile():
  Promise<User | null> {
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    if (!navigator.onLine) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (
        session?.user &&
        session.expires_at &&
        session.expires_at * 1000 > Date.now()
      ) {
        const cached = JSON.parse(
          localStorage.getItem(
            "sgo-profile:" + session.user.id,
          ) || "null",
        ) as User | null;

        return cached?.active
          ? cached
          : null;
      }
    }

    return null;
  }

  const {
    data,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id,name,email,role,active,created_at",
    )
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  localStorage.setItem(
    "sgo-profile:" + user.id,
    JSON.stringify(data),
  );

  return data as User;
}
