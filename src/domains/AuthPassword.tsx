import { useState } from "react";

import { supabase } from "../data";

type Props = {
  onDone: () => void;
};

export default function AuthPassword({
  onDone,
}: Props) {
  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmation,
    setConfirmation,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    busy,
    setBusy,
  ] = useState(false);

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={async (event) => {
          event.preventDefault();

          if (
            password !== confirmation
          ) {
            setError(
              "As senhas devem ser iguais.",
            );
            return;
          }

          setBusy(true);

          const { error } =
            await supabase!.auth.updateUser({
              password,
            });

          setBusy(false);

          if (error) {
            setError(
              error.message,
            );
          } else {
            onDone();
          }
        }}
      >
        <h2>
          Definir senha de acesso
        </h2>

        <label>
          Nova senha

          <input
            required
            type="password"
            minLength={12}
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          Confirmar senha

          <input
            required
            type="password"
            minLength={12}
            value={confirmation}
            onChange={(event) =>
              setConfirmation(
                event.target.value,
              )
            }
          />
        </label>

        <p>
          {error}
        </p>

        <button
          className="primary"
          disabled={busy}
        >
          Salvar senha
        </button>
      </form>
    </div>
  );
}
