import {
  DIAGNOSIS_PRICE_CATALOG as catalog,
} from "./priceCatalog";

import {
  budgetTotal,
  money,
  uid,
  type Work,
} from "../model";

type Props = {
  work: Work;
  update: (
    patch: Partial<Work>,
  ) => void;
};

export default function Budget({
  work,
  update,
}: Props) {
  return (
    <>
      <datalist id="price-catalog">
        {catalog.map(
          (item, index) => (
            <option
              key={index}
              value={item.descricao}
            >
              {item.preco}
            </option>
          ),
        )}
      </datalist>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Nº Preço</th>
              <th>Unidade</th>
              <th>Quantidade</th>
              <th>Preço unitário</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {work.budget.map(
              (row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      list="price-catalog"
                      value={
                        row.description
                      }
                      onChange={(event) => {
                        const selected =
                          catalog.find(
                            (item) =>
                              item.descricao ===
                              event.target.value,
                          );

                        update({
                          budget:
                            work.budget.map(
                              (item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      description:
                                        event.target.value,
                                      ...(
                                        selected
                                          ? {
                                              priceNumber:
                                                selected.preco,
                                              unit:
                                                selected.unid,
                                              unitPrice:
                                                selected.precoUnit,
                                            }
                                          : {}
                                      ),
                                    }
                                  : item,
                            ),
                        });
                      }}
                    />
                  </td>

                  <td>
                    {row.priceNumber || "—"}
                  </td>

                  <td>
                    {row.unit}
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.quantity}
                      onChange={(event) =>
                        update({
                          budget:
                            work.budget.map(
                              (item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      quantity:
                                        Number(
                                          event.target.value,
                                        ),
                                    }
                                  : item,
                            ),
                        })
                      }
                    />
                  </td>

                  <td>
                    {money(row.unitPrice)}
                  </td>

                  <td>
                    {money(
                      row.quantity *
                        row.unitPrice,
                    )}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        update({
                          budget:
                            work.budget.filter(
                              (item) =>
                                item.id !== row.id,
                            ),
                        })
                      }
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={() =>
          update({
            budget: [
              ...work.budget,
              {
                id: uid(),
                description: "",
                unit: "",
                quantity: 0,
                unitPrice: 0,
              },
            ],
          })
        }
      >
        Adicionar item
      </button>

      <strong>
        {" "}TOTAL:
        {" "}
        {money(budgetTotal(work))}
      </strong>

      <p className="hint">
        Preços do contrato Global – P0,
        catálogo do Relatórios Padrão 4.0.
        Itens históricos são preservados.
      </p>
    </>
  );
}
