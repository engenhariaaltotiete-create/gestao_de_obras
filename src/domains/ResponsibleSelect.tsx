import { useState } from "react";

import {
  normalize,
  type User,
} from "../model";

type Props = {
  users: User[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

export default function ResponsibleSelect({
  users,
  value,
  onChange,
  disabled = false,
}: Props) {
  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const selectedName =
    users.find(
      (user) => user.id === value,
    )?.name ||
    (
      value
        ? (
            /^[0-9a-f-]{36}$/i.test(value)
              ? "Responsável histórico não identificado"
              : value + " (legado)"
          )
        : "Sem responsável"
    );

  return (
    <div className="responsible-select">
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          setOpen(!open)
        }
        aria-expanded={open}
      >
        {selectedName}
      </button>

      {open && !disabled && (
        <div className="responsible-options">
          <input
            autoFocus
            placeholder="Pesquisar usuário ativo"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />

          <div role="listbox">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Sem responsável
            </button>

            {users
              .filter(
                (user) =>
                  user.active &&
                  normalize(user.name)
                    .includes(
                      normalize(search),
                    ),
              )
              .map(
                (user) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={
                      user.id === value
                    }
                    key={user.id}
                    onClick={() => {
                      onChange(user.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    {user.name}
                  </button>
                ),
              )}
          </div>
        </div>
      )}
    </div>
  );
}
