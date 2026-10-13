import {
  useEffect,
  useState,
} from "react";

import {
  pendingOperations,
  acceptRemote,
  type Pending,
} from "../sync";

import { supabase } from "../data";
import type { Work } from "../model";

type Props = {
  count: number;
  onRemote: (work: Work) => void;
};

export default function SyncIssues({
  count,
  onRemote,
}: Props) {
  const [
    items,
    setItems,
  ] = useState<Pending[]>([]);

  const [
    comparison,
    setComparison,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    void pendingOperations().then(
      setItems,
    );
  }, [count]);

  return (
    <details>
      <summary>
        Detalhes da sincronização e conflitos
      </summary>

      {items
        .filter(
          (item) => item.error,
        )
        .map(
          (item) => (
            <div key={item.id}>
              <strong>
                {item.work.address || item.id}
              </strong>

              <p>
                {item.error}
              </p>

              <button
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        item.work,
                        null,
                        2,
                      ),
                    ],
                    {
                      type: "application/json",
                    },
                  );

                  const link =
                    document.createElement("a");

                  link.href =
                    URL.createObjectURL(blob);

                  link.download =
                    "obra-local-" +
                    item.id +
                    ".json";

                  link.click();

                  URL.revokeObjectURL(
                    link.href,
                  );
                }}
              >
                Baixar cópia local
              </button>

              {item.conflict && (
                <>
                  <button
                    onClick={async () => {
                      const {
                        data,
                        error,
                      } = await supabase!
                        .from("obras")
                        .select(
                          "payload,revision",
                        )
                        .eq(
                          "id",
                          item.id,
                        )
                        .single();

                      if (error) {
                        setError(
                          error.message,
                        );
                        return;
                      }

                      setComparison(
                        JSON.stringify(
                          {
                            local: item.work,
                            servidor:
                              data.payload,
                            revisao:
                              data.revision,
                          },
                          null,
                          2,
                        ),
                      );
                    }}
                  >
                    Comparar com servidor
                  </button>

                  <button
                    onClick={async () => {
                      if (
                        !confirm(
                          "Após baixar sua cópia local, confirmar a substituição desta versão local pelos dados atuais do servidor?",
                        )
                      ) {
                        return;
                      }

                      try {
                        onRemote(
                          await acceptRemote(
                            item.id,
                          ),
                        );

                        setItems(
                          await pendingOperations(),
                        );

                        setComparison("");
                      } catch (failure) {
                        setError(
                          String(failure),
                        );
                      }
                    }}
                  >
                    Adotar versão do servidor
                  </button>
                </>
              )}
            </div>
          ),
        )}

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      {comparison && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {comparison}
        </pre>
      )}
    </details>
  );
}
