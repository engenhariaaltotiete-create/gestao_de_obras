import { geocode as queryGeocode } from "./domains/geocoding";

import { useState, useEffect, useMemo, Fragment } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline as LeafletPolyline,
  useMapEvents,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import { MapPin, Route, Check, X } from "lucide-react";

import {
  uid,
  distance,
  segLength,
  calculatedLength,
  executedLength,
  meters,
  SEG_STATUS,
  type Work,
  type Point,
  type Polyline,
  type Segment,
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
        background:conic-gradient(${(colors.length ? colors : ["#1266d9"])
          .map(
            (color, index, all) =>
              color +
              " " +
              (index / all.length) * 100 +
              "% " +
              ((index + 1) / all.length) * 100 +
              "%",
          )
          .join(",")});
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
  onChange: (work: Work | ((current: Work) => Work)) => void;
};

function Center({ target }: { target: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.setView(target, 17);
    }
  }, [target, map]);

  return null;
}

function FitTrechos({
  bounds,
  nonce,
}: {
  bounds: L.LatLngBoundsExpression | null;
  nonce: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 18 });
  }, [map, bounds, nonce]);
  return null;
}

function Clicks({ click }: { click: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => click(event.latlng.lat, event.latlng.lng),
  });

  return null;
}

function MapGestures({ enabled }: { enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px), (pointer: coarse)");
    const update = () => {
      const interact = !media.matches || enabled;
      if (interact) {
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
      } else {
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
      }
      map.scrollWheelZoom.disable();
      map.getContainer().classList.toggle("page-scroll-map", !interact);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [map, enabled]);
  return null;
}

function SegmentLabels({
  work,
  visible,
  select,
}: {
  work: Work;
  visible: boolean;
  select: (id: string) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    const update = () => {
      layer.clearLayers();
      if (!visible || map.getZoom() < 15) return;
      const occupied: { x: number; y: number; width: number }[] = [];
      const points = new Map(work.points.map((p) => [p.id, p]));
      for (const segment of work.segments) {
        const a = points.get(segment.from),
          b = points.get(segment.to);
        if (!a || !b) continue;
        const from = map.latLngToContainerPoint([a.lat, a.lng]),
          to = map.latLngToContainerPoint([b.lat, b.lng]);
        if (from.distanceTo(to) < 45) continue;
        const x = (from.x + to.x) / 2,
          y = (from.y + to.y) / 2;
        const width = Math.min(220, Math.max(70, (segment.name || "Trecho").length * 7));
        if (
          occupied.some(
            (p) =>
              Math.abs(p.x - x) < (p.width + width) / 2 &&
              Math.abs(p.y - y) < 32,
          )
        )
          continue;
        occupied.push({ x, y, width });
        let angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        const root = document.createElement("div");
        root.className = "segment-label";
        root.style.width = width + "px";
        root.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
        const name = document.createElement("strong");
        name.textContent = segment.name || "Trecho";
        const length = document.createElement("small");
        length.textContent = meters(segLength(segment)) + " m";
        root.append(name, length);
        L.marker(map.containerPointToLatLng([x, y]), {
          icon: L.divIcon({
            html: root,
            className: "segment-label-anchor",
            iconSize: [0, 0],
          }),
          keyboard: true,
          title: segment.name,
          bubblingMouseEvents: false,
        })
          .on("click", () => select(segment.id))
          .addTo(layer);
      }
    };
    update();
    map.on("zoomend moveend resize", update);
    return () => {
      map.off("zoomend moveend resize", update);
      layer.remove();
    };
  }, [map, work.points, work.segments, visible, select]);
  return null;
}

function CursorTracker({onMove}:{onMove:(point:[number,number])=>void}){
 useMapEvents({mousemove:e=>onMove([e.latlng.lat,e.latlng.lng])});return null;
}

export default function MapEditor({ work, onChange, readOnly = false }: Props) {
  const [mode, setMode] = useState<"point" | "line" | "edit" | "split" | null>(null);

  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<[number,number]|null>(null);
  const [selectedPoint,setSelectedPoint]=useState<string|null>(null);
  const [hoverSegment,setHoverSegment]=useState<string|null>(null);
  const [splitPreview,setSplitPreview]=useState<{id:string;lat:number;lng:number;fraction:number}|null>(null);

  const [search, setSearch] = useState("");

  const [target, setTarget] = useState<[number, number] | null>(null);

  const [message, setMessage] = useState("");

  const [highlight, setHighlight] = useState("");

  const [geocode, setGeocode] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [labels, setLabels] = useState(true);
  const [segmentDraft, setSegmentDraft] = useState<Segment | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [segmentError, setSegmentError] = useState("");
  const selectSegment = (id: string) => {
    if (mode === "point" || mode === "line") return;
    setHighlight(id);
    setChoices([]);
    setSegmentError("");
    if (!readOnly)
      setSegmentDraft({ ...work.segments.find((s) => s.id === id)! });
  };
  const selectAt = (event: L.LeafletMouseEvent, id: string) => {
    if (mode === "split") {
      L.DomEvent.stopPropagation(event.originalEvent);
      const original=work.segments.find(s=>s.id===id);
      if(!original)return;
      const a=work.points.find(p=>p.id===original.from),b=work.points.find(p=>p.id===original.to);
      if(!a||!b)return;
      // Project the click onto the selected straight segment, avoiding off-line points.
      const map=(event.target as L.Polyline & {_map:L.Map})._map;
      const pa=map.latLngToLayerPoint([a.lat,a.lng]),pb=map.latLngToLayerPoint([b.lat,b.lng]),pc=map.latLngToLayerPoint(event.latlng);
      const vx=pb.x-pa.x,vy=pb.y-pa.y,den=vx*vx+vy*vy;
      if(!den)return;
      const fraction=Math.max(0,Math.min(1,((pc.x-pa.x)*vx+(pc.y-pa.y)*vy)/den));
      if(fraction<0.02||fraction>0.98){setMessage('Escolha uma posição afastada das extremidades.');return;}
      const projected=map.layerPointToLatLng(L.point(pa.x+fraction*vx,pa.y+fraction*vy));
      const middle:Point={id:uid(),lat:projected.lat,lng:projected.lng,name:`P-${work.points.length+1}`,createdAt:new Date().toISOString()};
      const first={...original,id:uid(),name:`${original.name||'Trecho'} A`,to:middle.id,calculated:distance(a,middle),manual:original.manual===null?null:original.manual*fraction};
      const second={...original,id:uid(),name:`${original.name||'Trecho'} B`,from:middle.id,calculated:distance(middle,b),manual:original.manual===null?null:original.manual*(1-fraction)};
      const line=work.lines.find(l=>l.id===original.lineId);
      const lines=line&&!work.segments.some(s=>s.id!==id&&s.lineId===line.id)?work.lines.filter(l=>l.id!==line.id):work.lines;
      const leftLine={id:uid(),pointIds:[a.id,middle.id]},rightLine={id:uid(),pointIds:[middle.id,b.id]};
      first.lineId=leftLine.id;second.lineId=rightLine.id;
      onChange({...work,points:[...work.points,middle],lines:[...lines,leftLine,rightLine],segments:[...work.segments.filter(s=>s.id!==id),first,second]});
      setHighlight('');setMessage('Trecho dividido. Revise os status e salve o croqui.');return;
    }
    if (mode === "line" || mode === "point" || mode === "edit") return;
    L.DomEvent.stopPropagation(event.originalEvent);
    const map = (event.target as L.Polyline & { _map: L.Map })._map;
    const click = map.latLngToContainerPoint(event.latlng);
    const nearby = work.segments
      .filter((s) => {
        const a = work.points.find((p) => p.id === s.from),
          b = work.points.find((p) => p.id === s.to);
        return (
          a &&
          b &&
          L.LineUtil.pointToSegmentDistance(
            click,
            map.latLngToContainerPoint([a.lat, a.lng]),
            map.latLngToContainerPoint([b.lat, b.lng]),
          ) <= 14
        );
      })
      .map((s) => s.id);
    if (nearby.length > 1) setChoices(nearby);
    else selectSegment(id);
  };
  const deleteSegment = (id: string) => {
    if (
      !window.confirm(
        "Excluir este trecho? A exclusão será registrada ao salvar o croqui.",
      )
    )
      return;
    onChange((current) => ({
      ...current,
      segments: current.segments.filter((s) => s.id !== id),
    }));
    setSegmentDraft(null);
    setHighlight("");
  };

  const byId = useMemo(
    () => new Map(work.points.map((point) => [point.id, point])),
    [work.points],
  );

  const focusBounds = useMemo(
    () =>
      (focusNonce || readOnly)
        ? work.segments
            .flatMap((segment) => [
              byId.get(segment.from),
              byId.get(segment.to),
            ])
            .filter((point): point is Point => !!point)
            .map((point) => [point.lat, point.lng] as [number, number])
        : null,
    [focusNonce, readOnly, work.segments, byId],
  );

  const reset = () => {
    setDraft([]);
    setMode(null);
    setNavigating(false);
  };

  const add = (lat: number, lng: number) => {
    if (!mode || mode === "edit" || mode === "split" || readOnly) {
      return;
    }

    const nearest = work.points.find(
      (point) => distance(point, { id: "", lat, lng }) < 8,
    );

    const point = nearest || {
      id: uid(),
      lat,
      lng,
      name:`P-${work.points.length+draft.length+1}`,
      createdAt:new Date().toISOString(),
    };

    if (mode === "point") {
      setDraft([point]);
      return;
    }

    if (draft.at(-1)?.id === point.id) {
      return;
    }

    setDraft((current) => [...current, point]);
  };

  const finish = async () => {
    if (mode === "point" && draft.length) {
      const point = draft[0];

      if (!work.points.some((existing) => existing.id === point.id)) {
        onChange({
          ...work,
          points: [...work.points, point],
        });
      }

      reset();
      return;
    }

    if (mode !== "line" || draft.length < 2) {
      return;
    }

    const line: Polyline = {
      id: uid(),
      pointIds: draft.map((point) => point.id),
    };

    const newPoints = draft.filter(
      (point) => !work.points.some((existing) => existing.id === point.id),
    );

    const segments = draft.slice(1).map((point, index) => ({
      id: uid(),
      name: `Trecho ${work.segments.length + index + 1}`,
      address: "",
      calculated: distance(draft[index], point),
      manual: null,
      status: "AGUARDANDO",
      statusAt: new Date().toISOString(),
      from: draft[index].id,
      to: point.id,
      lineId: line.id,
    }));

    onChange({
      ...work,
      points: [...work.points, ...newPoints],
      lines: [...work.lines, line],
      segments: [...work.segments, ...segments],
    });

    reset();
  };

  const center: [number, number] = work.points.length
    ? [work.points[0].lat, work.points[0].lng]
    : [-23.542, -46.31];

  const lookup = async () => {
    setGeocode(true);

    try {
      const changes = await Promise.all(
        work.segments
          .filter((segment) => !segment.address)
          .map(async (segment) => {
            const from = byId.get(segment.from);

            const to = byId.get(segment.to);

            if (!from || !to) {
              return null;
            }

            try {
              const result = await queryGeocode(
                "reverse?format=json" +
                  "&lat=" +
                  (from.lat + to.lat) / 2 +
                  "&lon=" +
                  (from.lng + to.lng) / 2 +
                  "&zoom=17&addressdetails=1",
              );

              return {
                id: segment.id,
                district: result.address?.suburb || "",
                city: result.address?.city || result.address?.town || "",
                state: result.address?.["ISO3166-2-lvl4"]?.split("-")[1] || "",
                postcode: result.address?.postcode || "",
                address:
                  [result.address?.road, result.address?.house_number]
                    .filter(Boolean)
                    .join(", ") ||
                  result.display_name ||
                  "",
              };
            } catch {
              return null;
            }
          }),
      );

      onChange((current) => ({
        ...current,
        segments: current.segments.map((segment) =>
          segment.address
            ? segment
            : {
                ...segment,
                ...(changes.find((change) => change?.id === segment.id) || {}),
              },
        ),
      }));
    } finally {
      setGeocode(false);
    }
  };

  useEffect(() => {
    setDraft([]);
    setMode(null);
    setNavigating(false);
    setSegmentDraft(null);
    setChoices([]);
  }, [work.id]);

  useEffect(() => {
    if (!readOnly && work.segments.some((segment) => !segment.address)) {
      void lookup();
    }
  }, [work.segments.length, readOnly]);

  useEffect(() => {
    if (readOnly) setSegmentDraft(null);
  }, [readOnly]);
  return (
    <div className="map-section">
      <div className="searchrow">
        <input
          placeholder="Pesquisar endereço para navegar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <button
          onClick={async () => {
            try {
              const results = await queryGeocode(
                "search?format=json&q=" +
                  encodeURIComponent(search) +
                  "&countrycodes=br&limit=1",
              );

              if (results[0]) {
                setTarget([Number(results[0].lat), Number(results[0].lon)]);
              } else {
                setMessage("Endereço não encontrado");
              }
            } catch {
              setMessage("Busca indisponível; o croqui permanece disponível");
            }
          }}
        >
          Buscar
        </button>
      </div>

      <p className="hint">{message}</p>

      <div className="toolbar">
        <button aria-pressed={labels} onClick={() => setLabels((v) => !v)}>
          {labels ? "Ocultar identificações" : "Mostrar identificações"}
        </button>
        <button className={!mode ? "active" : ""} onClick={reset}>
          Navegação
        </button>

        {!readOnly && (
          <>
            <button
              className={mode === "edit" ? "active" : ""}
              onClick={() => setMode("edit")}
            >
              Editar pontos
            </button>

            <button
              className={mode === "point" ? "active" : ""}
              onClick={() => {
                setMode("point");
                setDraft([]);
              }}
            >
              <MapPin size={15} /> Ponto
            </button>

            <button className={mode === "split" ? "active" : ""} onClick={()=>{setMode('split');setDraft([])}}>Dividir trecho</button>
            <button
              className={mode === "line" ? "active" : ""}
              onClick={() => {
                setMode("line");
                setDraft([]);
              }}
            >
              <Route size={15} /> Novo trecho / ramal
            </button>

            {mode && (
              <button onClick={reset}>
                <X size={15} /> Cancelar
              </button>
            )}

            {((mode === "point" && draft.length >= 1) ||
              (mode === "line" && draft.length >= 2)) && (
              <button className="primary" onClick={finish}>
                <Check size={15} /> Concluir
              </button>
            )}
          </>
        )}
      </div>

      <div
        className={
          "map-wrap " +
          (mode === "line" || mode === "point"
            ? "drawing"
            : mode === "edit"
              ? "editing-points"
              : "")
        }
      >
        <button
          className="map-navigation-toggle"
          aria-pressed={navigating || !!mode}
          onClick={() => {
            if (mode) reset();
            else setNavigating((v) => !v);
          }}
        >
          {navigating || mode ? "VOLTAR À ROLAGEM" : "NAVEGAR NO MAPA"}
        </button>
        <div className="sketch-extent-panel"><div>Extensão total <strong>{meters(calculatedLength(work))} m</strong></div><div>Executada <strong>{meters(executedLength(work))} m</strong></div><div>A executar <strong>{meters(Math.max(0,calculatedLength(work)-executedLength(work)))} m</strong></div></div>
        {mode==='line'&&draft.length>0&&<div className="sketch-distance-panel">Distância: <strong>{meters(draft.slice(1).reduce((sum,p,i)=>sum+distance(draft[i],p),0)+(cursor?distance(draft[draft.length-1],{id:'',lat:cursor[0],lng:cursor[1]}):0))} m</strong></div>}
        <MapContainer
          key={work.id}
          center={center}
          zoom={15}
          style={{
            height: "min(65vh, 612px)",
            width: "100%",
          }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitTrechos nonce={focusNonce} bounds={focusBounds} />
          <MapGestures enabled={navigating || !!mode} />
          <SegmentLabels work={work} visible={labels} select={selectSegment} />
          <Clicks click={add} />
          {mode==='line'&&<CursorTracker onMove={setCursor}/>}
          <Center target={target} />

          {work.segments.map((segment) => {
            const from = byId.get(segment.from);

            const to = byId.get(segment.to);

            return from && to ? (
              <Fragment key={segment.id}>
                <LeafletPolyline
                  positions={[
                    [from.lat, from.lng],
                    [to.lat, to.lng],
                  ]}
                  pathOptions={{
                    color: segmentColor(segment.status),
                    weight: highlight === segment.id || hoverSegment === segment.id ? 8 : 5,
                    interactive: false,
                  }}
                />
                <LeafletPolyline
                  positions={[
                    [from.lat, from.lng],
                    [to.lat, to.lng],
                  ]}
                  pathOptions={{
                    color: "#000",
                    opacity: 0,
                    weight: 28,
                    bubblingMouseEvents: false,
                  }}
                  eventHandlers={{
                    click: (event) => selectAt(event, segment.id),
                    mouseover:()=>setHoverSegment(segment.id),
                    mousemove:(event)=>{if(mode!=='split')return;const map=(event.target as L.Polyline & {_map:L.Map})._map;const pa=map.latLngToLayerPoint([from.lat,from.lng]),pb=map.latLngToLayerPoint([to.lat,to.lng]),pc=map.latLngToLayerPoint(event.latlng);const dx=pb.x-pa.x,dy=pb.y-pa.y,den=dx*dx+dy*dy;if(!den)return;const fraction=Math.max(0,Math.min(1,((pc.x-pa.x)*dx+(pc.y-pa.y)*dy)/den));const projected=map.layerPointToLatLng(L.point(pa.x+fraction*dx,pa.y+fraction*dy));setSplitPreview({id:segment.id,lat:projected.lat,lng:projected.lng,fraction});},
                    mouseout:()=>{setHoverSegment(null);setSplitPreview(null)},
                  }}
                />
              </Fragment>
            ) : null;
          })}

          {mode==='split' && splitPreview && (()=>{const segment=work.segments.find(s=>s.id===splitPreview.id);if(!segment)return null;const a=byId.get(segment.from),b=byId.get(segment.to);if(!a||!b)return null;const total=segLength(segment);return <Marker position={[splitPreview.lat,splitPreview.lng]} interactive={false} icon={L.divIcon({className:'split-preview-marker',html:`<span class="split-preview-dist">${meters(total*splitPreview.fraction)} m</span><i></i><span class="split-preview-dist">${meters(total*(1-splitPreview.fraction))} m</span>`,iconSize:[170,30],iconAnchor:[85,15]})}/>})()}
          {mode==='line'&&draft.length>0&&cursor&&<LeafletPolyline positions={[[draft[draft.length-1].lat,draft[draft.length-1].lng],cursor]} pathOptions={{color:'#ec8c18',weight:3,dashArray:'7 7',interactive:false}}/>}
          {work.points.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={nodeIcon(
                work.segments
                  .filter(
                    (segment) =>
                      segment.from === point.id || segment.to === point.id,
                  )
                  .map((segment) => segmentColor(segment.status)),
              )}
              interactive={mode!=='split'}
              draggable={!readOnly && mode === "edit"}
              eventHandlers={{
                dragend: (event) => {
                  const position = event.target.getLatLng();

                  const points = work.points.map((existing) =>
                    existing.id === point.id
                      ? {
                          ...existing,
                          lat: position.lat,
                          lng: position.lng,
                        }
                      : existing,
                  );

                  const ids = new Map(
                    points.map((existing) => [existing.id, existing]),
                  );

                  onChange({
                    ...work,
                    points,
                    segments: work.segments.map((segment) =>
                      segment.from === point.id || segment.to === point.id
                        ? {
                            ...segment,
                            manual: null,
                            calculated: distance(
                              ids.get(segment.from)!,
                              ids.get(segment.to)!,
                            ),
                          }
                        : segment,
                    ),
                  });
                },

                click: () => {
                  if(mode==='edit'&&!readOnly){setSelectedPoint(point.id);return;}
                  if (mode==='line'||mode==='point') {
                    add(point.lat, point.lng);
                  }
                },
              }}
            />
          ))}

          {draft.length > 1 && (
            <LeafletPolyline
              positions={draft.map((point) => [point.lat, point.lng])}
              pathOptions={{
                color: "#ec8c18",
                weight: 4,
                dashArray: "6 6",
              }}
            />
          )}

          {draft.map((point) => (
            <Marker
              key={"draft" + point.id}
              position={[point.lat, point.lng]}
              icon={pin}
            />
          ))}
        </MapContainer>
      </div>

      {selectedPoint&&!readOnly&&<div className="diagnostic-modal" onClick={()=>setSelectedPoint(null)}><div className="diagnostic-modal-content sketch-point-dialog" onClick={e=>e.stopPropagation()}><h3>Dados do ponto</h3>{(()=>{const p=work.points.find(x=>x.id===selectedPoint);if(!p)return null;return <><label>Nome<input value={p.name||''} onChange={e=>onChange({...work,points:work.points.map(x=>x.id===p.id?{...x,name:e.target.value}:x)})}/></label><label>Tipo<input value={p.type||''} onChange={e=>onChange({...work,points:work.points.map(x=>x.id===p.id?{...x,type:e.target.value}:x)})}/></label><label>Observações<textarea value={p.notes||''} onChange={e=>onChange({...work,points:work.points.map(x=>x.id===p.id?{...x,notes:e.target.value}:x)})}/></label><p>Coordenadas: {p.lat.toFixed(6)}, {p.lng.toFixed(6)}</p><p>Cadastro: {p.createdAt?new Date(p.createdAt).toLocaleDateString('pt-BR'):'Registro anterior'}</p></>})()}<button onClick={()=>setSelectedPoint(null)}>Fechar</button></div></div>}
      <div className="section-head">
        <strong>Trechos cadastrados ({work.segments.length})</strong>

        <button
          onClick={() => setFocusNonce((current) => current + 1)}
          disabled={!work.segments.length}
        >
          Focar nos trechos
        </button>
        <button
          onClick={lookup}
          disabled={
            readOnly ||
            geocode ||
            !work.segments.some((segment) => !segment.address)
          }
        >
          {geocode ? "Consultando..." : "Identificar endereços"}
        </button>
      </div>

      <div className="table-scroll">
        <table className="segment-list">
          <thead>
            <tr>
              <th>Trecho</th>
              <th>Logradouro / Número</th>
              <th>Bairro</th>
              <th>Município</th>
              <th>Ext (m)</th>
              <th>Status</th>
              <th>Data do Status</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {work.segments.map((segment) => (
              <tr
                id={`segment-${segment.id}`}
                key={segment.id}
                className={highlight === segment.id ? "selected" : ""}
              >
                <td>
                  <button onClick={() => selectSegment(segment.id)}>
                    {segment.name}
                  </button>
                </td>
                <td>{segment.address || "Endereço não identificado"}</td>
                <td>{segment.district || "—"}</td>
                <td>{segment.city || "—"}</td>
                <td>{meters(segLength(segment))}</td>
                <td>{segment.status}</td>
                <td>{segment.statusAt ? new Date(segment.statusAt).toLocaleDateString("pt-BR") : "—"}</td>
                <td>
                  <button
                    title={readOnly ? "Destacar trecho" : "Editar trecho"}
                    onClick={() => selectSegment(segment.id)}
                  >
                    <MapPin size={15} />
                    {readOnly ? "Destacar" : "Editar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {choices.length > 0 && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Escolher trecho"
        >
          <div className="modal">
            <h2>Trechos próximos — escolha um</h2>
            <div className="segment-choices">
              {choices.map((id) => (
                <button key={id} onClick={() => selectSegment(id)}>
                  {work.segments.find((s) => s.id === id)?.name}
                </button>
              ))}
              <button onClick={() => setChoices([])}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {segmentDraft && !readOnly && (
        <div
          className="modal-backdrop segment-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Editar trecho"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSegmentDraft(null);
          }}
        >
          <form
            className="modal segment-modal"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !segmentDraft.name.trim() ||
                !Number.isFinite(segLength(segmentDraft)) ||
                (segmentDraft.manual !== null &&
                  (!Number.isFinite(segmentDraft.manual) ||
                    segmentDraft.manual < 0))
              ) {
                setSegmentError("Informe nome e extensão válida.");
                return;
              }
              onChange((current) => ({
                ...current,
                segments: current.segments.map((s) =>
                  s.id === segmentDraft.id
                    ? { ...s, ...segmentDraft, name: segmentDraft.name.trim(), statusAt: s.status !== segmentDraft.status ? new Date().toISOString() : s.statusAt }
                    : s,
                ),
              }));
              setSegmentDraft(null);
            }}
          >
            <h2>Editar trecho</h2>
            <div className="segment-form">
              {(
                [
                  ["name", "Nome"],
                  ["address", "Logradouro / Número"],
                  ["district", "Bairro"],
                  ["city", "Município"],
                  ["state", "Estado"],
                  ["postcode", "CEP"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className={"segment-field-" + field}>
                  {label}
                  <input
                    required={field === "name"}
                    value={segmentDraft[field] || ""}
                    onChange={(e) =>
                      setSegmentDraft({
                        ...segmentDraft,
                        [field]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <label className="segment-field-status">
                Status
                <select
                  aria-label="Status"
                  value={segmentDraft.status}
                  onChange={(e) =>
                    setSegmentDraft({ ...segmentDraft, status: e.target.value })
                  }
                >
                  {SEG_STATUS.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="segment-field-length">
                Extensão manual (m)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={segmentDraft.manual ?? ""}
                  placeholder={String(segmentDraft.calculated)}
                  onChange={(e) =>
                    setSegmentDraft({
                      ...segmentDraft,
                      manual:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <small>
                  Calculada: {segmentDraft.calculated} m. Deixe vazio para usar
                  a calculada.
                </small>
              </label>
            </div>
            {segmentError && <p className="error">{segmentError}</p>}
            <p className="hint">
              Após ajustar os trechos, salve o bloco Croqui para persistir e
              registrar a auditoria.
            </p>
            <div className="modal-actions">
              <button type="submit" className="primary">
                Salvar
              </button>
              <button type="button" onClick={() => setSegmentDraft(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => deleteSegment(segmentDraft.id)}
              >
                Excluir
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="sketch-points-register"><strong>Pontos cadastrados ({work.points.length})</strong><div className="sketch-points-grid">{work.points.map((p,i)=><div key={p.id}><b>{p.name||`P-${String(i+1).padStart(3,'0')}`}</b><small>ID: {p.id}</small><span>{p.type||'Ponto'} · {p.lat.toFixed(6)}, {p.lng.toFixed(6)}</span>{p.notes&&<small>{p.notes}</small>}</div>)}</div></div>
      <div className="total-line">
        Extensão ativa:{" "}
        <b>
          {meters(
            work.segments
              .filter((segment) => segment.status !== "CANCELADO")
              .reduce((sum, segment) => sum + segLength(segment), 0),
          )}{" "}
          m
        </b>
      </div>

      <p className="hint">
        Clique no mapa para criar pontos. Uma polilinha pode começar em qualquer
        ponto existente. Trechos cancelados não entram no total. Nós com vários
        status usam setores nas cores dos trechos conectados.
      </p>
    </div>
  );
}
