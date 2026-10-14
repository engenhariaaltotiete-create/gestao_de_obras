import { useState, type FormEvent } from "react";

import { supabase } from "../data";
import type { User } from "../model";

type Props = {
  users: User[];
  refresh: () => Promise<unknown>;
};

export default function UserAdmin({ users, refresh }: Props) {
  const [query, setQuery] = useState("");

  const [filter, setFilter] = useState("");

  const [draft, setDraft] = useState<Partial<User>>({
    name: "",
    email: "",
    role: "user",
    active: true,
  });

  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      setMessage("Convites exigem Supabase configurado.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: draft,
      });

      if (error) {
        let message = error.message;
        if (error.context instanceof Response) {
          const details = await error.context
            .clone()
            .json()
            .catch(() => null);
          message = details?.error || message;
        }
        throw new Error(message);
      }

      await refresh();

      setDraft({
        name: "",
        email: "",
        role: "user",
        active: true,
      });

      setMessage("Operação concluída.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>USUÁRIOS</h1>

      <form onSubmit={submit} className="form-grid">
        <label>
          Nome completo
          <input
            required
            value={draft.name || ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                name: event.target.value,
              })
            }
          />
        </label>

        <label>
          E-mail
          <input
            required
            type="email"
            readOnly={!!draft.id}
            value={draft.email || ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                email: event.target.value,
              })
            }
          />
        </label>

        <label>
          Perfil
          <select
            value={draft.role}
            onChange={(event) =>
              setDraft({
                ...draft,
                role: event.target.value as User["role"],
              })
            }
          >
            <option value="user">Usuário</option>

            <option value="admin">Administrador</option>
          </select>
        </label>

        <label>
          Situação
          <select
            value={String(draft.active)}
            onChange={(event) =>
              setDraft({
                ...draft,
                active: event.target.value === "true",
              })
            }
          >
            <option value="true">Ativo</option>

            <option value="false">Inativo</option>
          </select>
        </label>

        <button className="primary" disabled={busy}>
          {draft.id ? "Salvar alterações" : "Convidar por e-mail"}
        </button>
        {draft.id && (
          <button
            type="button"
            onClick={() =>
              setDraft({ name: "", email: "", role: "user", active: true })
            }
          >
            Cancelar edição
          </button>
        )}
      </form>

      <p role="status">{message}</p>

      <input
        placeholder="Pesquisar nome ou e-mail"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <select
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        <option value="">Todas as situações</option>

        <option value="true">Ativos</option>

        <option value="false">Inativos</option>
      </select>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Situação</th>
              <th>Criação</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {users
              .filter(
                (user) =>
                  (user.name + " " + user.email)
                    .toLowerCase()
                    .includes(query.toLowerCase()) &&
                  (!filter || String(user.active) === filter),
              )
              .map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>

                  <td>{user.email}</td>

                  <td>{user.role === "admin" ? "Administrador" : "Usuário"}</td>

                  <td>{user.active ? "Ativo" : "Inativo"}</td>

                  <td>
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        setDraft({
                          ...user,
                        })
                      }
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
