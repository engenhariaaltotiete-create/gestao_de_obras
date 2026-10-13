// Nominatim:
// - sem autocomplete;
// - requisições sequenciais;
// - intervalo mínimo de 1,1 segundo;
// - cache persistente de resultados.

let tail = Promise.resolve();
let last = 0;

export function geocode(
  path: string,
): Promise<any> {
  const key =
    "sgo-geocode:" + path;

  try {
    const cached =
      localStorage.getItem(key);

    if (cached) {
      return Promise.resolve(
        JSON.parse(cached),
      );
    }
  } catch {
    // Uma falha no cache não impede a consulta.
  }

  const result = tail.then(
    async () => {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            Math.max(
              0,
              1100 -
                (
                  Date.now() - last
                ),
            ),
          ),
      );

      last = Date.now();

      const response = await fetch(
        "https://nominatim.openstreetmap.org/" +
          path,
        {
          headers: {
            "Accept-Language": "pt-BR",
          },
          signal:
            AbortSignal.timeout(12000),
        },
      );

      if (!response.ok) {
        throw new Error(
          "Geocodificação indisponível",
        );
      }

      const data =
        await response.json();

      try {
        localStorage.setItem(
          key,
          JSON.stringify(data),
        );
      } catch {
        // A consulta continua válida mesmo
        // quando não houver espaço no cache.
      }

      return data;
    },
  );

  // Uma consulta que falha não interrompe
  // as consultas seguintes da fila.
  tail = result.then(
    () => {},
    () => {},
  );

  return result;
}
