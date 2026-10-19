import test from "node:test";
import assert from "node:assert/strict";
import { copySelectedSketch } from "../src/domains/sketch.ts";
const source = () => ({
  points: [
    { id: "a", lat: 1, lng: 1 },
    { id: "bend", lat: 2, lng: 3 },
    { id: "b", lat: 3, lng: 1 },
    { id: "c", lat: 4, lng: 1 },
    { id: "x", lat: 8, lng: 8 },
    { id: "y", lat: 9, lng: 9 },
  ],
  lines: [
    { id: "curve", pointIds: ["a", "bend", "b", "c"] },
    { id: "other", pointIds: ["x", "y"] },
  ],
  segments: [
    {
      id: "first",
      from: "a",
      to: "b",
      lineId: "curve",
      name: "Curva",
      calculated: 250,
      manual: 275,
      status: "CONCLUÍDO",
      statusAt: "2026-10-19",
    },
    {
      id: "second",
      from: "b",
      to: "c",
      lineId: "curve",
      name: "Continuação",
      calculated: 50,
      manual: null,
      status: "AGUARDANDO",
    },
    {
      id: "other",
      from: "x",
      to: "y",
      lineId: "other",
      calculated: 10,
      status: "AGUARDANDO",
    },
  ],
});

test("cópia de croqui preserva vértices intermediários, IDs e metadados", () => {
  const data = source();
  const copy = copySelectedSketch(data, data.segments);
  assert.deepEqual(copy, data);
  copy.points[0].lat = 999;
  copy.lines[0].pointIds.reverse();
  copy.segments[0].manual = 1;
  assert.equal(data.points[0].lat, 1);
  assert.deepEqual(data.lines[0].pointIds, ["a", "bend", "b", "c"]);
  assert.equal(data.segments[0].manual, 275);
});

test("seleção parcial copia apenas trechos e linhas referenciadas e mantém todos os seus vértices", () => {
  const data = source();
  const copy = copySelectedSketch(data, [data.segments[0]]);
  assert.deepEqual(copy.segments, [data.segments[0]]);
  assert.deepEqual(copy.lines, [data.lines[0]]);
  assert.deepEqual(copy.points, data.points.slice(0, 4));
  assert.equal(
    copy.points.some((p) => p.id === "bend"),
    true,
  );
  assert.equal(
    copy.segments.some((s) => s.id === "second"),
    false,
  );
});

test("trechos na mesma linha e sentido inverso preservam a ordem da linha original", () => {
  const data = source();
  const reverse = { ...data.segments[0], from: "b", to: "a" };
  const copy = copySelectedSketch(data, [reverse, data.segments[1]]);
  assert.equal(copy.lines.length, 1);
  assert.deepEqual(copy.lines[0].pointIds, ["a", "bend", "b", "c"]);
  assert.deepEqual(copy.segments, [reverse, data.segments[1]]);
});

test("extremos são mantidos mesmo em dados legados sem a linha e seleção vazia não copia nada", () => {
  const data = source();
  const legacy = { ...data.segments[0], lineId: "missing" };
  assert.deepEqual(copySelectedSketch(data, [legacy]).points, [
    data.points[0],
    data.points[2],
  ]);
  assert.deepEqual(copySelectedSketch(data, []), {
    points: [],
    lines: [],
    segments: [],
  });
});
