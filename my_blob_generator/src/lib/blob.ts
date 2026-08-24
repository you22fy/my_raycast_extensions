export const BLOB_SIZE = 1024;

export type BlobSettings = {
  edgesLevel: number;
  smoothnessLevel: number;
  color: string;
  seed: string;
};

export type BlobResult = BlobSettings & {
  pointCount: number;
  path: string;
  svg: string;
};

type Point = {
  x: number;
  y: number;
};

function clampLevel(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function formatNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}

function pointText(point: Point) {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function createPoints(pointCount: number, random: () => number) {
  const center = BLOB_SIZE / 2;
  const radius = BLOB_SIZE * 0.4;
  const angleStep = (Math.PI * 2) / pointCount;
  const phase = random() * Math.PI * 2;

  return Array.from({ length: pointCount }, (_, index) => {
    // Keep the anchors in a mostly even radial order. Large angular and radius
    // jumps make the tangent mathematically continuous but visually polygonal.
    const angleJitter = (random() - 0.5) * angleStep * 0.16;
    const angle = phase + index * angleStep + angleJitter;
    const pointRadius = radius * (0.78 + random() * 0.22);
    return {
      x: center + Math.cos(angle) * pointRadius,
      y: center + Math.sin(angle) * pointRadius,
    };
  });
}

function createPath(points: Point[], smoothnessLevel: number) {
  const smoothness = (clampLevel(smoothnessLevel) - 1) / 9;
  // Even level 1 remains a curved blob. Higher levels extend the handles to
  // make the transitions rounder instead of starting from a hard polygon.
  const controlScale = 0.14 + smoothness * 0.08;
  let path = `M ${pointText(points[0])}`;

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    const firstControl = {
      x: current.x + (next.x - previous.x) * controlScale,
      y: current.y + (next.y - previous.y) * controlScale,
    };
    const secondControl = {
      x: next.x - (afterNext.x - current.x) * controlScale,
      y: next.y - (afterNext.y - current.y) * controlScale,
    };

    path += ` C ${pointText(firstControl)}, ${pointText(secondControl)}, ${pointText(next)}`;
  }

  return `${path} Z`;
}

export function generateBlob(settings: BlobSettings): BlobResult {
  const edgesLevel = clampLevel(settings.edgesLevel);
  const smoothnessLevel = clampLevel(settings.smoothnessLevel);
  const pointCount = edgesLevel + 2;
  const points = createPoints(pointCount, createRandom(settings.seed));
  const path = createPath(points, smoothnessLevel);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BLOB_SIZE}" height="${BLOB_SIZE}" viewBox="0 0 ${BLOB_SIZE} ${BLOB_SIZE}">`,
    `  <path fill="${settings.color}" d="${path}"/>`,
    `</svg>`,
  ].join("\n");

  return {
    ...settings,
    edgesLevel,
    smoothnessLevel,
    pointCount,
    path,
    svg,
  };
}
