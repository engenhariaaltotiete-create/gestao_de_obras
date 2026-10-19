import type { Segment, Work } from "../model.ts";

type Sketch = Pick<Work, "points" | "lines" | "segments">;

// A linha pode ter vértices intermediários que não são extremos de trechos.
// Copiamos as linhas referenciadas por inteiro, mantendo IDs e ordem dos pontos.
export function copySelectedSketch(
  source: Sketch,
  selectedSegments: Segment[],
): Sketch {
  const lineIds = new Set(selectedSegments.map((segment) => segment.lineId));
  const lines = source.lines
    .filter((line) => lineIds.has(line.id))
    .map((line) => ({ ...line, pointIds: [...line.pointIds] }));
  const pointIds = new Set(lines.flatMap((line) => line.pointIds));

  for (const segment of selectedSegments) {
    pointIds.add(segment.from);
    pointIds.add(segment.to);
  }

  return {
    points: source.points
      .filter((point) => pointIds.has(point.id))
      .map((point) => ({ ...point })),
    lines,
    segments: selectedSegments.map((segment) => ({ ...segment })),
  };
}
