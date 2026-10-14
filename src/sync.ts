import { supabase } from "./data.ts";

import {
  classifySyncError,
  retryDelay,
  isConfirmed,
} from "./domains/syncPolicy.ts";

import { syncStages, type Work } from "./model";

export type Pending = {
  id: string;
  work: Work;
  version: string;
  baseRevision: number | null;
  attempts: number;
  error: string | null;
  blocked: boolean;
  nextTry: number;
  conflict?: boolean;
};

type Stored = {
  id: string;
  work: Work;
  revision: number | null;
};

export type SyncState = {
  pending: number;
  errors: number;
  syncing: boolean;
  offline: boolean;
};

export type SyncTransport = {
  currentUser: () => Promise<string | null>;
  save: (work: Work, revision: number | null) => Promise<unknown>;
};

let transport: SyncTransport | null = supabase
  ? {
      currentUser: async () => {
        const {
          data: { user },
        } = await supabase!.auth.getUser();

        return user?.id || null;
      },

      save: async (work, revision) => {
        const { data, error } = await supabase!.rpc("save_work_if_revision", {
          p_id: work.id,
          p_created_at: work.createdAt,
          p_payload: work,
          p_expected_revision: revision,
        });

        if (error) {
          throw error;
        }

        return data;
      },
    }
  : null;

export function configureSyncTransport(value: SyncTransport | null) {
  transport = value;
}

let dbPromise: Promise<IDBDatabase> | undefined;

let owner = "";
let syncing = false;

const listeners = new Set<(state: SyncState) => void>();

const state: SyncState = {
  pending: 0,
  errors: 0,
  syncing: false,
  offline: !navigator.onLine,
};

export function configureSync(id: string) {
  if (id !== owner) {
    owner = id;
    dbPromise = undefined;
  }

  void emit();
}

const db = () => {
  if (!owner) {
    return Promise.reject(new Error("Sessão não verificada"));
  }

  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("sgo-offline-v3-" + owner, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("works", { keyPath: "id" });

      request.result.createObjectStore("queue", { keyPath: "id" });
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => reject(request.error);
  }));
};

const request = <T>(operation: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);

    operation.onerror = () => reject(operation.error);
  });

const completed = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();

    transaction.onerror = () => reject(transaction.error);

    transaction.onabort = () => reject(transaction.error);
  });

async function all<T>(store: "works" | "queue"): Promise<T[]> {
  const database = await db();

  return request<T[]>(database.transaction(store).objectStore(store).getAll());
}

async function emit() {
  const queue = owner ? await all<Pending>("queue") : [];

  Object.assign(state, {
    pending: queue.length,
    errors: queue.filter((item) => item.error).length,
    syncing,
    offline: !navigator.onLine,
  });

  listeners.forEach((listener) => listener({ ...state }));
}

export function observeSync(listener: (state: SyncState) => void) {
  listeners.add(listener);
  listener({ ...state });

  void emit();

  return () => {
    listeners.delete(listener);
  };
}

export async function cachedWorks() {
  return (await all<Stored>("works")).map((item) => syncStages(item.work));
}

export async function pendingOperations() {
  return owner ? all<Pending>("queue") : [];
}

export async function enqueueWork(work: Work) {
  const database = await db();

  const transaction = database.transaction(["works", "queue"], "readwrite");

  const done = completed(transaction);

  const queueStore = transaction.objectStore("queue");

  const workStore = transaction.objectStore("works");

  const old = await request<Pending | undefined>(queueStore.get(work.id));

  const saved = await request<Stored | undefined>(workStore.get(work.id));

  const pending: Pending = {
    id: work.id,
    work,
    version: crypto.randomUUID(),
    baseRevision: old ? old.baseRevision : (saved?.revision ?? null),
    attempts: 0,
    error: old?.conflict ? old.error : null,
    blocked: old?.conflict || false,
    conflict: old?.conflict,
    nextTry: 0,
  };

  workStore.put({
    id: work.id,
    work,
    revision: saved?.revision ?? null,
  });

  queueStore.put(pending);

  // Obra e operação precisam ser confirmadas
  // na mesma transação local.
  await done;
  await emit();

  void flushQueue();
}

export async function mergeRemote(
  rows: {
    id: string;
    payload: Work;
    revision: number;
  }[],
) {
  const database = await db();

  const transaction = database.transaction(["works", "queue"], "readwrite");

  const done = completed(transaction);

  const pending = await request<Pending[]>(
    transaction.objectStore("queue").getAll(),
  );

  const pendingIds = new Set(pending.map((item) => item.id));

  const store = transaction.objectStore("works");

  const local = await request<Stored[]>(store.getAll());

  const remoteIds = new Set(rows.map((row) => row.id));

  for (const row of rows) {
    const existing = local.find((item) => item.id === row.id);

    if (
      !pendingIds.has(row.id) &&
      (!existing?.revision || row.revision >= existing.revision)
    ) {
      store.put({
        id: row.id,
        work: row.payload,
        revision: row.revision,
      });
    }
  }

  for (const item of local) {
    if (!remoteIds.has(item.id) && !pendingIds.has(item.id)) {
      store.delete(item.id);
    }
  }

  await done;

  return cachedWorks();
}

async function updatePending(item: Pending, patch: Partial<Pending>) {
  const database = await db();

  const transaction = database.transaction("queue", "readwrite");

  const done = completed(transaction);

  const store = transaction.objectStore("queue");

  const latest = await request<Pending | undefined>(store.get(item.id));

  if (latest?.version === item.version) {
    store.put({
      ...latest,
      ...patch,
    });
  }

  await done;
}

async function confirm(item: Pending, revision: number) {
  const database = await db();

  const transaction = database.transaction(["queue", "works"], "readwrite");

  const done = completed(transaction);

  const queue = transaction.objectStore("queue");

  const latest = await request<Pending | undefined>(queue.get(item.id));

  if (latest?.version === item.version) {
    transaction.objectStore("works").put({
      id: item.id,
      work: item.work,
      revision,
    });

    queue.delete(item.id);
  } else if (latest) {
    // Uma edição feita durante o envio
    // permanece pendente com a nova revisão-base.
    queue.put({
      ...latest,
      baseRevision: revision,
    });

    transaction.objectStore("works").put({
      id: item.id,
      work: latest.work,
      revision,
    });
  }

  await done;
}

async function performFlush() {
  if (syncing || !owner || !transport || !navigator.onLine) {
    return;
  }

  const currentOwner = owner;

  if ((await transport.currentUser()) !== owner) {
    return;
  }

  syncing = true;
  await emit();

  try {
    for (const item of await all<Pending>("queue")) {
      if (owner !== currentOwner) {
        break;
      }

      if (item.blocked || item.nextTry > Date.now()) {
        continue;
      }

      try {
        const data = await transport.save(item.work, item.baseRevision);

        if (owner !== currentOwner) {
          break;
        }

        if (!isConfirmed(data)) {
          await updatePending(item, {
            blocked: true,
            conflict: (data as { ok?: boolean })?.ok === false,
            error:
              (
                data as {
                  reason?: string;
                }
              )?.reason || "Resposta sem confirmação de sucesso",
          });

          continue;
        }

        await confirm(item, data.revision);
      } catch (error) {
        if (owner !== currentOwner) {
          break;
        }

        await updatePending(item, {
          attempts: item.attempts + 1,
          error:
            (
              error as {
                message?: string;
              }
            )?.message || String(error),
          blocked: classifySyncError(error) === "blocked",
          nextTry: Date.now() + retryDelay(item.attempts + 1),
        });
      }
    }
  } finally {
    syncing = false;
    await emit();
  }
}

export async function flushQueue() {
  if (navigator.locks && owner) {
    await navigator.locks.request(
      "sgo-sync-" + owner,
      {
        ifAvailable: true,
      },
      async (lock) => {
        if (lock) {
          await performFlush();
        }
      },
    );
  } else {
    await performFlush();
  }
}

export function startSync() {
  const online = () => {
    void emit();
    void flushQueue();
  };

  window.addEventListener("online", online);

  window.addEventListener("offline", online);

  const interval = setInterval(online, 15000);

  void flushQueue();

  return () => {
    window.removeEventListener("online", online);

    window.removeEventListener("offline", online);

    clearInterval(interval);
  };
}

export async function retryErrors() {
  for (const item of await pendingOperations()) {
    if (!item.conflict) {
      await updatePending(item, {
        blocked: false,
        error: null,
        nextTry: 0,
      });
    }
  }

  await emit();
  void flushQueue();
}

export async function acceptRemote(id: string) {
  if (!supabase) {
    throw new Error("Servidor indisponível");
  }

  const { data, error } = await supabase
    .from("obras")
    .select("id,payload,revision")
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  const database = await db();

  const transaction = database.transaction(["works", "queue"], "readwrite");

  const done = completed(transaction);

  transaction.objectStore("works").put({
    id,
    work: syncStages(data.payload as Work),
    revision: data.revision,
  });

  transaction.objectStore("queue").delete(id);

  await done;
  await emit();

  return syncStages(data.payload as Work);
}
