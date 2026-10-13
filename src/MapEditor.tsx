import {
  geocode as queryGeocode,
} from "./domains/geocoding";

import {
  useState,
  useEffect,
  useMemo,
} from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline as LeafletPolyline,
  useMapEvents,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import {
  MapPin,
  Route,
  Check,
  X,
} from "lucide-react";

import {
  uid,
  distance,
  segLength,
  meters,
  SEG_STATUS,
  type Work,
  type Point,
  type Polyline,
} from "./model";

import "leaflet/dist/leaflet.css";

const segmentColor = (status: string) =>
  status === "CONCLUÍDO"
    ? "#21a36a"
    : status === "PARALISADO"
      ? "#dc3545"
      : status === "CANCELADO"
        ? "#888"
        : "#1266d9";

const nodeIcon = (colors: string[]) =>
  L.divIcon({
    html: `
      <div style="
        width:24px;
        height:24px;
        border:3px solid white;
        border-radius:50%;
        background:conic-gradient(${
          (
            colors.length
              ? colors
              : ["#1266d9"]
          )
            .map(
              (color, index, all) =>
                color +
                " " +
                (index / all.length) * 100 +
                "% " +
                ((index + 1) / all.length) * 100 +
                "%",
            )
            .join(",")
        });
        box-shadow:0 1px 5px #3338;
      "></div>
    `,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

const pin = L.divIcon({
  html: `
    <div style="
      background:#1164d8;
      border:2px solid white;
      border-radius:50%;
      width:13px;
      height:13px;
      box-shadow:0 1px 5px #3338;
    "></div>
  `,
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type Props = {
  work: Work;
  readOnly?: boolean;
  onChange: (
    work:
      | Work
      | ((current: Work) => Work),
  ) => void;
};

function Center({
  target,
}: {
  target: [number, number] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.setView(target, 17);
    }
  }, [target, map]);

  return null;
}

function Clicks({
  click,
}: {
  click: (
    lat: number,
    lng: number,
  ) => void;
}) {
  useMapEvents({
    click: (event) =>
      click(
        event.latlng.lat,
        event.latlng.lng,
      ),
  });

  return null;
}

export default function MapEditor({
  work,
  onChange,
  readOnly = false,
}: Props) {
  const [
    mode,
    setMode,
  ] = useState<
    "point" | "line" | "edit" | null
  >(null);

  const [
    draft,
    setDraft,
  ] = useState<Point[]>([]);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    target,
    setTarget,
  ] = useState<
    [number, number] | null
  >(null);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    highlight,
    setHighlight,
  ] = useState("");

  const [
    geocode,
    setGeocode,
  ] = useState(false);

  const byId = useMemo(
    () =>
      new Map(
        work.points.map(
          (point) => [
            point.id,
            point,
          ],
        ),
      ),
    [work.points],
  );

  const reset = () => {
    setDraft([]);
    setMode(null);
  };

  const add = (
    lat: number,
    lng: number,
  ) => {
    if (
      !mode ||
      mode === "edit" ||
      readOnly
    ) {
      return;
    }

    const nearest = work.points.find(
      (point) =>
        distance(
          point,
          { id: "", lat, lng },
        ) < 8,
    );

    const point =
      nearest || {
        id: uid(),
        lat,
        lng,
      };

    if (mode === "point") {
      setDraft([point]);
      return;
    }

    if (
      draft.at(-1)?.id === point.id
    ) {
      return;
    }

    setDraft(
      (current) => [
        ...current,
        point,
      ],
    );
  };

  const finish = async () => {
    if (
      mode === "point" &&
      draft.length
    ) {
      const point = draft[0];

      if (
        !work.points.some(
          (existing) =>
            existing.id === point.id,
        )
      ) {
        onChange({
          ...work,
          points: [
            ...work.points,
            point,
          ],
        });
      }

      reset();
      return;
    }

    if (
      mode !== "line" ||
      draft.length < 2
    ) {
      return;
    }

    const line: Polyline = {
      id: uid(),
      pointIds: draft.map(
        (point) => point.id,
      ),
    };

    const newPoints = draft.filter(
      (point) =>
        !work.points.some(
          (existing) =>
            existing.id === point.id,
        ),
    );

    const segments = draft
      .slice(1)
      .map(
        (point, index) => ({
          id: uid(),
          name:
            `Trecho ${
              work.segments.length +
              index +
              1
            }`,
          address: "",
          calculated: distance(
            draft[index],
            point,
          ),
          manual: null,
          status: "AGUARDANDO",
          from: draft[index].id,
          to: point.id,
          lineId: line.id,
        }),
      );

    onChange({
      ...work,
      points: [
        ...work.points,
        ...newPoints,
      ],
      lines: [
        ...work.lines,
        line,
      ],
      segments: [
        ...work.segments,
        ...segments,
      ],
    });

    reset();
  };

  const changeSegment = (
    id: string,
    patch: Record<string, unknown>,
  ) =>
    onChange({
      ...work,
      segments: work.segments.map(
        (segment) =>
          segment.id === id
            ? {
                ...segment,
                ...patch,
              }
            : segment,
      ),
    });

  const center: [number, number] =
    work.points.length
      ? [
          work.points[0].lat,
          work.points[0].lng,
        ]
      : [-23.542, -46.31];

  const lookup = async () => {
    setGeocode(true);

    try {
      const changes =
        await Promise.all(
          work.segments
            .filter(
              (segment) =>
                !segment.address,
            )
            .map(
              async (segment) => {
                const from =
                  byId.get(segment.from);

                const to =
                  byId.get(segment.to);

                if (!from || !to) {
                  return null;
                }

                try {
                  const result =
                    await queryGeocode(
                      "reverse?format=json" +
                        "&lat=" +
                        (from.lat + to.lat) / 2 +
                        "&lon=" +
                        (from.lng + to.lng) / 2 +
                        "&zoom=17&addressdetails=1",
                    );

                  return {
                    id: segment.id,
                    district:
                      result.address?.suburb ||
                      "",
                    city:
                      result.address?.city ||
                      result.address?.town ||
                      "",
                    state:
                      result.address?.[
                        "ISO3166-2-lvl4"
                      ]?.split("-")[1] ||
                      "",
                    postcode:
                      result.address?.postcode ||
                      "",
                    address:
                      [
                        result.address?.road,
                        result.address?.house_number,
                      ]
                        .filter(Boolean)
                        .join(", ") ||
                      result.display_name ||
                      "",
                  };
                } catch {
                  return null;
                }
              },
            ),
        );

      onChange(
        (current) => ({
          ...current,
          segments:
            current.segments.map(
              (segment) =>
                segment.address
                  ? segment
                  : {
                      ...segment,
                      ...(
                        changes.find(
                          (change) =>
                            change?.id ===
                            segment.id,
                        ) || {}
                      ),
                    },
            ),
        }),
      );
    } finally {
      setGeocode(false);
    }
  };

  useEffect(() => {
    setDraft([]);
    setMode(null);
  }, [work.id]);

  useEffect(() => {
    if (
      !readOnly &&
      work.segments.some(
        (segment) => !segment.address,
      )
    ) {
      void lookup();
    }
  }, [
    work.segments.length,
    readOnly,
  ]);

  return (
    <div className="map-section">
      <div className="searchrow">
        <input
          placeholder="Pesquisar endereço para navegar"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value,
            )
          }
        />

        <button
          onClick={async () => {
            try {
              const results =
                await queryGeocode(
                  "search?format=json&q=" +
                    encodeURIComponent(
                      search,
                    ) +
                    "&countrycodes=br&limit=1",
                );

              if (results[0]) {
                setTarget([
                  Number(results[0].lat),
                  Number(results[0].lon),
                ]);
              } else {
                setMessage(
                  "Endereço não encontrado",
                );
              }
            } catch {
              setMessage(
                "Busca indisponível; o croqui permanece disponível",
              );
            }
          }}
        >
          Buscar
        </button>
      </div>

      <p className="hint">
        {message}
      </p>

      <div className="toolbar">
        <button
          className={
            !mode ? "active" : ""
          }
          onClick={reset}
        >
          Navegação
        </button>

        {!readOnly && (
          <>
            <button
              className={
                mode === "edit"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMode("edit")
              }
            >
              Editar pontos
            </button>

            <button
              className={
                mode === "point"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setMode("point");
                setDraft([]);
              }}
            >
              <MapPin size={15} />
              {" "}Ponto
            </button>

            <button
              className={
                mode === "line"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setMode("line");
                setDraft([]);
              }}
            >
              <Route size={15} />
              {" "}Novo trecho / ramal
            </button>

            {mode && (
              <button
                onClick={reset}
              >
                <X size={15} />
                {" "}Cancelar
              </button>
            )}

            {(
              (
                mode === "point" &&
                draft.length >= 1
              ) ||
              (
                mode === "line" &&
                draft.length >= 2
              )
            ) && (
              <button
                className="primary"
                onClick={finish}
              >
                <Check size={15} />
                {" "}Concluir
              </button>
            )}
          </>
        )}
      </div>

      <div
        className={
          "map-wrap " +
          (
            mode === "line" ||
            mode === "point"
              ? "drawing"
              : mode === "edit"
                ? "editing-points"
                : ""
          )
        }
      >
        <MapContainer
          key={work.id}
          center={center}
          zoom={15}
          style={{
            height: 350,
            width: "100%",
          }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Clicks click={add} />
          <Center target={target} />

          {work.segments.map(
            (segment) => {
              const from =
                byId.get(segment.from);

              const to =
                byId.get(segment.to);

              return from && to ? (
                <LeafletPolyline
                  key={segment.id}
                  positions={[
                    [from.lat, from.lng],
                    [to.lat, to.lng],
                  ]}
                  pathOptions={{
                    color:
                      segmentColor(
                        segment.status,
                      ),
                    weight:
                      highlight ===
                      segment.id
                        ? 9
                        : 5,
                  }}
                  eventHandlers={{
                    click: () => {
                      setHighlight(
                        segment.id,
                      );

                      document
                        .getElementById(
                          `segment-${segment.id}`,
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                        });
                    },
                  }}
                />
              ) : null;
            },
          )}

          {work.points.map(
            (point) => (
              <Marker
                key={point.id}
                position={[
                  point.lat,
                  point.lng,
                ]}
                icon={nodeIcon(
                  work.segments
                    .filter(
                      (segment) =>
                        segment.from ===
                          point.id ||
                        segment.to ===
                          point.id,
                    )
                    .map(
                      (segment) =>
                        segmentColor(
                          segment.status,
                        ),
                    ),
                )}
                draggable={
                  !readOnly &&
                  mode === "edit"
                }
                eventHandlers={{
                  dragend: (event) => {
                    const position =
                      event.target
                        .getLatLng();

                    const points =
                      work.points.map(
                        (existing) =>
                          existing.id ===
                          point.id
                            ? {
                                ...existing,
                                lat:
                                  position.lat,
                                lng:
                                  position.lng,
                              }
                            : existing,
                      );

                    const ids = new Map(
                      points.map(
                        (existing) => [
                          existing.id,
                          existing,
                        ],
                      ),
                    );

                    onChange({
                      ...work,
                      points,
                      segments:
                        work.segments.map(
                          (segment) =>
                            segment.from ===
                              point.id ||
                            segment.to ===
                              point.id
                              ? {
                                  ...segment,
                                  manual: null,
                                  calculated:
                                    distance(
                                      ids.get(
                                        segment.from,
                                      )!,
                                      ids.get(
                                        segment.to,
                                      )!,
                                    ),
                                }
                              : segment,
                        ),
                    });
                  },

                  click: () => {
                    if (mode) {
                      add(
                        point.lat,
                        point.lng,
                      );
                    }
                  },
                }}
              />
            ),
          )}

          {draft.length > 1 && (
            <LeafletPolyline
              positions={draft.map(
                (point) => [
                  point.lat,
                  point.lng,
                ],
              )}
              pathOptions={{
                color: "#ec8c18",
                weight: 4,
                dashArray: "6 6",
              }}
            />
          )}

          {draft.map(
            (point) => (
              <Marker
                key={"draft" + point.id}
                position={[
                  point.lat,
                  point.lng,
                ]}
                icon={pin}
              />
            ),
          )}
        </MapContainer>
      </div>

      <div className="section-head">
        <strong>
          Trechos da obra
          {" "}({work.segments.length})
        </strong>

        <button
          onClick={lookup}
          disabled={
            readOnly ||
            geocode ||
            !work.segments.some(
              (segment) =>
                !segment.address,
            )
          }
        >
          {geocode
            ? "Consultando..."
            : "Identificar endereços"}
        </button>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Trecho</th>
              <th>Logradouro</th>
              <th>
                Bairro / Município / UF / CEP
              </th>
              <th>Ext (m)</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {work.segments.map(
              (segment) => (
                <tr
                  id={
                    `segment-${segment.id}`
                  }
                  key={segment.id}
                  className={
                    highlight === segment.id
                      ? "selected"
                      : ""
                  }
                >
                  <td>
                    <input
                      disabled={readOnly}
                      value={segment.name}
                      onChange={(event) =>
                        changeSegment(
                          segment.id,
                          {
                            name:
                              event.target.value,
                          },
                        )
                      }
                    />
                  </td>

                  <td>
                    <input
                      disabled={readOnly}
                      value={segment.address}
                      placeholder="Endereço não identificado"
                      onChange={(event) =>
                        changeSegment(
                          segment.id,
                          {
                            address:
                              event.target.value,
                          },
                        )
                      }
                    />
                  </td>

                  <td>
                    {(
                      [
                        "district",
                        "city",
                        "state",
                        "postcode",
                      ] as const
                    ).map(
                      (field) => (
                        <input
                          disabled={readOnly}
                          key={field}
                          placeholder={
                            {
                              district:
                                "Bairro",
                              city:
                                "Município",
                              state:
                                "UF",
                              postcode:
                                "CEP",
                            }[field]
                          }
                          value={
                            segment[field] ||
                            ""
                          }
                          onChange={(event) =>
                            changeSegment(
                              segment.id,
                              {
                                [field]:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      ),
                    )}
                  </td>

                  <td>
                    <input
                      disabled={readOnly}
                      type="number"
                      min="0"
                      value={
                        segLength(segment)
                      }
                      onChange={(event) =>
                        changeSegment(
                          segment.id,
                          {
                            manual:
                              Math.max(
                                0,
                                Math.round(
                                  Number(
                                    event.target.value,
                                  ) || 0,
                                ),
                              ),
                          },
                        )
                      }
                    />
                  </td>

                  <td>
                    <select
                      disabled={readOnly}
                      value={segment.status}
                      onChange={(event) =>
                        changeSegment(
                          segment.id,
                          {
                            status:
                              event.target.value,
                          },
                        )
                      }
                    >
                      {SEG_STATUS.map(
                        (status) => (
                          <option
                            key={status}
                          >
                            {status}
                          </option>
                        ),
                      )}
                    </select>
                  </td>

                  <td>
                    <button
                      title="Destacar no mapa"
                      onClick={() =>
                        setHighlight(
                          segment.id,
                        )
                      }
                    >
                      <MapPin size={15} />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="total-line">
        Extensão ativa:
        {" "}
        <b>
          {meters(
            work.segments
              .filter(
                (segment) =>
                  segment.status !==
                  "CANCELADO",
              )
              .reduce(
                (sum, segment) =>
                  sum +
                  segLength(segment),
                0,
              ),
          )}
          {" "}m
        </b>
      </div>

      <p className="hint">
        Clique no mapa para criar pontos.
        Uma polilinha pode começar em
        qualquer ponto existente.
        Trechos cancelados não entram
        no total. Nós com vários status
        usam setores nas cores dos
        trechos conectados.
      </p>
    </div>
  );
}
