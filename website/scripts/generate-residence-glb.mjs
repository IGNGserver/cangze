import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parametric Architectural glTF 2.0 (.glb) Builder for Cangze (藏泽) Official Website.
 * Constructs "泽居 · The Sanctuary Pavilion": a richly furnished two-story modernist smart home
 * with merged vertex-colored PBR buckets (baked contact AO), stairwell cut-through, full-home
 * living/hall/kitchen/suite/study/bath/garage furnishings, and independent controllable light emitters.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'public', 'models', 'cangze-residence.glb');

const PALETTE = {
  travertine: '#dfd7c9',
  travertineWarm: '#cfc4b2',
  basalt: '#282d34',
  basaltMid: '#3a404a',
  plaster: '#ece8e0',
  whiteCeramic: '#f4f2ee',
  porcelainSoft: '#e5e0d8',
  walnut: '#794f32',
  walnutDark: '#583823',
  cedar: '#a66e46',
  oak: '#be976c',
  bronze: '#423932',
  brass: '#bc955e',
  steel: '#c3c8d0',
  darkMetal: '#272b32',
  linen: '#ebe6dd',
  linenWarm: '#ddd4c5',
  charcoalFabric: '#3c414b',
  terracotta: '#a66242',
  sageFabric: '#6b7d6e',
  oledScreen: '#11151d',
  evBody: '#2e3745',
  evRubber: '#191c21',
  evTaillight: '#be1e3c',
  bookCream: '#e4ddd0',
  bookSlate: '#4c5c6e',
  bookRust: '#964e39',
  bookSage: '#596f5d',
  oliveLeaf: '#4c674b',
  oliveLeafLight: '#637f5f',
  fiddleLeaf: '#345839',
  shrubLeaf: '#3e5c3d',
  lilyPad: '#466a45',
  soil: '#362a20',
};

const MATERIALS = [
  // Static architectural shell (casts & receives shadows)
  {
    name: 'ShellStone',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.03,
    roughnessFactor: 0.8,
  },
  {
    name: 'ShellWood',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.04,
    roughnessFactor: 0.52,
  },
  {
    name: 'ShellMetal',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.86,
    roughnessFactor: 0.3,
  },
  // Interior furniture & props (receives shadows only; saves shadow-pass cost)
  {
    name: 'InteriorWood',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.04,
    roughnessFactor: 0.48,
  },
  {
    name: 'InteriorSoft',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.88,
  },
  {
    name: 'InteriorSurface',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.08,
    roughnessFactor: 0.28,
  },
  {
    name: 'InteriorMetal',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.88,
    roughnessFactor: 0.24,
  },
  // Organic landscape & indoor plants
  {
    name: 'Foliage',
    vertexColored: true,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.82,
  },
  // Single-plane architectural glass (zero 6-face overdraw)
  {
    name: 'ArchitecturalGlass',
    vertexColored: false,
    baseColorFactor: [0.76, 0.88, 0.98, 0.2],
    metallicFactor: 0.12,
    roughnessFactor: 0.05,
    alphaMode: 'BLEND',
    doubleSided: true,
  },
  // Independent entity-bound emissive fixtures
  {
    name: 'Emit_LivingCeiling',
    vertexColored: false,
    baseColorFactor: [0.9, 0.86, 0.8, 1.0],
    emissiveFactor: [1.0, 0.78, 0.48],
    metallicFactor: 0.0,
    roughnessFactor: 0.3,
  },
  {
    name: 'Emit_LivingLamp',
    vertexColored: false,
    baseColorFactor: [0.92, 0.89, 0.84, 1.0],
    emissiveFactor: [1.0, 0.72, 0.4],
    metallicFactor: 0.0,
    roughnessFactor: 0.28,
  },
  {
    name: 'Emit_KitchenPendant',
    vertexColored: false,
    baseColorFactor: [0.9, 0.86, 0.8, 1.0],
    emissiveFactor: [1.0, 0.78, 0.48],
    metallicFactor: 0.05,
    roughnessFactor: 0.26,
  },
  {
    name: 'Emit_BedroomLight',
    vertexColored: false,
    baseColorFactor: [0.94, 0.91, 0.86, 1.0],
    emissiveFactor: [1.0, 0.72, 0.42],
    metallicFactor: 0.0,
    roughnessFactor: 0.26,
  },
  {
    name: 'Emit_CourtyardPath',
    vertexColored: false,
    baseColorFactor: [0.88, 0.84, 0.78, 1.0],
    emissiveFactor: [1.0, 0.68, 0.34],
    metallicFactor: 0.0,
    roughnessFactor: 0.3,
  },
  // Always-on architectural & tech accent emitters
  {
    name: 'Emit_WarmAccent',
    vertexColored: false,
    baseColorFactor: [1.0, 0.76, 0.42, 1.0],
    emissiveFactor: [1.0, 0.6, 0.22],
    metallicFactor: 0.0,
    roughnessFactor: 0.25,
  },
  {
    name: 'Emit_SapphireAccent',
    vertexColored: false,
    baseColorFactor: [0.3, 0.64, 0.98, 1.0],
    emissiveFactor: [0.2, 0.5, 0.92],
    metallicFactor: 0.25,
    roughnessFactor: 0.2,
  },
];

const MAT = Object.fromEntries(MATERIALS.map((m, idx) => [m.name, idx]));

const colorCache = new Map();
function hexToLinear(hex) {
  if (colorCache.has(hex)) return colorCache.get(hex);
  const clean = hex.replace('#', '');
  const srgb = [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  colorCache.set(hex, lin);
  return lin;
}

function rotateY(x, y, z, cx, cz, angle) {
  if (!angle) return [x, y, z];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - cx;
  const dz = z - cz;
  return [cx + dx * c + dz * s, y, cz - dx * s + dz * c];
}

function rotateNormalY(nx, ny, nz, angle) {
  if (!angle) return [nx, ny, nz];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [nx * c + nz * s, ny, -nx * s + nz * c];
}

function worldUV(p, n, scale = 0.45) {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0] * scale, p[2] * scale];
  if (ax >= az) return [p[2] * scale, p[1] * scale];
  return [p[0] * scale, p[1] * scale];
}

class MeshBucket {
  constructor(name, matDef) {
    this.name = name;
    this.materialIndex = MAT[matDef.name];
    this.vertexColored = matDef.vertexColored;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  pushVertex(p, n, uv, linColor, shade = 1.0) {
    const idx = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(uv[0], uv[1]);
    if (this.vertexColored) {
      const toU16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
      this.colors.push(
        toU16(linColor[0] * shade),
        toU16(linColor[1] * shade),
        toU16(linColor[2] * shade),
        65535,
      );
    }
    return idx;
  }

  addQuad(p0, p1, p2, p3, normal, hex = '#ffffff', opts = {}) {
    const lin = hexToLinear(hex);
    const uvScale = opts.uvScale ?? 0.45;
    const s0 = opts.s0 ?? 1;
    const s1 = opts.s1 ?? 1;
    const s2 = opts.s2 ?? 1;
    const s3 = opts.s3 ?? 1;
    const i0 = this.pushVertex(p0, normal, worldUV(p0, normal, uvScale), lin, s0);
    const i1 = this.pushVertex(p1, normal, worldUV(p1, normal, uvScale), lin, s1);
    const i2 = this.pushVertex(p2, normal, worldUV(p2, normal, uvScale), lin, s2);
    const i3 = this.pushVertex(p3, normal, worldUV(p3, normal, uvScale), lin, s3);
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  addTriangle(p0, p1, p2, normal, hex = '#ffffff', shade = 1.0) {
    const lin = hexToLinear(hex);
    const i0 = this.pushVertex(p0, normal, worldUV(p0, normal, 0.45), lin, shade);
    const i1 = this.pushVertex(p1, normal, worldUV(p1, normal, 0.45), lin, shade);
    const i2 = this.pushVertex(p2, normal, worldUV(p2, normal, 0.45), lin, shade);
    this.indices.push(i0, i1, i2);
  }

  addGlassPane(p0, p1, p2, p3, normal) {
    this.addQuad(p0, p1, p2, p3, normal, '#ffffff', { uvScale: 0.25 });
  }

  addBox(cx, cy, cz, sx, sy, sz, hex = '#ffffff', opts = {}) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const x0 = cx - hx;
    const x1 = cx + hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const z0 = cz - hz;
    const z1 = cz + hz;
    const rotY = opts.rotY ?? 0;
    const aoB = opts.aoBottom ?? 0.78;
    const aoT = opts.aoTop ?? 1.0;
    const uvScale = opts.uvScale ?? 0.45;

    const pt = (x, y, z) => rotateY(x, y, z, cx, cz, rotY);
    const nm = (nx, ny, nz) => rotateNormalY(nx, ny, nz, rotY);

    if (!opts.cullFront) {
      this.addQuad(pt(x0, y0, z1), pt(x1, y0, z1), pt(x1, y1, z1), pt(x0, y1, z1), nm(0, 0, 1), hex, {
        uvScale,
        s0: aoB,
        s1: aoB,
        s2: aoT,
        s3: aoT,
      });
    }
    if (!opts.cullBack) {
      this.addQuad(pt(x1, y0, z0), pt(x0, y0, z0), pt(x0, y1, z0), pt(x1, y1, z0), nm(0, 0, -1), hex, {
        uvScale,
        s0: aoB,
        s1: aoB,
        s2: aoT,
        s3: aoT,
      });
    }
    if (!opts.cullRight) {
      this.addQuad(pt(x1, y0, z1), pt(x1, y0, z0), pt(x1, y1, z0), pt(x1, y1, z1), nm(1, 0, 0), hex, {
        uvScale,
        s0: aoB,
        s1: aoB,
        s2: aoT,
        s3: aoT,
      });
    }
    if (!opts.cullLeft) {
      this.addQuad(pt(x0, y0, z0), pt(x0, y0, z1), pt(x0, y1, z1), pt(x0, y1, z0), nm(-1, 0, 0), hex, {
        uvScale,
        s0: aoB,
        s1: aoB,
        s2: aoT,
        s3: aoT,
      });
    }
    if (!opts.cullTop) {
      this.addQuad(pt(x0, y1, z1), pt(x1, y1, z1), pt(x1, y1, z0), pt(x0, y1, z0), nm(0, 1, 0), hex, {
        uvScale,
        s0: aoT,
        s1: aoT,
        s2: aoT,
        s3: aoT,
      });
    }
    if (!opts.cullBottom) {
      this.addQuad(pt(x0, y0, z0), pt(x1, y0, z0), pt(x1, y0, z1), pt(x0, y0, z1), nm(0, -1, 0), hex, {
        uvScale,
        s0: aoB,
        s1: aoB,
        s2: aoB,
        s3: aoB,
      });
    }
  }

  /** Indexed 24-vertex smooth-normal beveled box for soft cushions, mattresses, and sculpted bodies */
  addChamferBox(cx, cy, cz, sx, sy, sz, bevel, hex = '#ffffff', opts = {}) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const b = Math.max(0.004, Math.min(bevel, hx * 0.44, hy * 0.44, hz * 0.44));
    const ix = hx - b;
    const iy = hy - b;
    const iz = hz - b;
    const rotY = opts.rotY ?? 0;
    const aoB = opts.aoBottom ?? 0.8;
    const aoT = opts.aoTop ?? 1.0;
    const uvScale = opts.uvScale ?? 0.55;
    const lin = hexToLinear(hex);

    // 8 corners, 3 vertices per corner: 0=X-face, 1=Y-face, 2=Z-face
    const cornerSigns = [
      [-1, -1, -1],
      [1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [-1, 1, 1],
      [1, 1, 1],
    ];
    const verts = [];
    for (let c = 0; c < 8; c++) {
      const [sxS, syS, szS] = cornerSigns[c];
      const core = [sxS * ix, syS * iy, szS * iz];
      const offsets = [
        [sxS * hx, syS * iy, szS * iz],
        [sxS * ix, syS * hy, szS * iz],
        [sxS * ix, syS * iy, szS * hz],
      ];
      const shade = syS < 0 ? aoB : aoT;
      for (const off of offsets) {
        const dx = off[0] - core[0];
        const dy = off[1] - core[1];
        const dz = off[2] - core[2];
        // Blend sharp face normal with bevel direction for soft pillowy shading
        const nxL = dx * 0.72 + sxS * 0.28;
        const nyL = dy * 0.72 + syS * 0.28;
        const nzL = dz * 0.72 + szS * 0.28;
        const nLen = Math.hypot(nxL, nyL, nzL) || 1;
        const wPos = rotateY(cx + off[0], cy + off[1], cz + off[2], cx, cz, rotY);
        const wNorm = rotateNormalY(nxL / nLen, nyL / nLen, nzL / nLen, rotY);
        const vIdx = this.pushVertex(wPos, wNorm, worldUV(wPos, wNorm, uvScale), lin, shade);
        verts.push({ vIdx, pos: wPos });
      }
    }

    const vid = (c, k) => c * 3 + k;
    const emitOutwardTri = (a, bI, c) => {
      const va = verts[a].pos;
      const vb = verts[bI].pos;
      const vc = verts[c].pos;
      const e1 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
      const e2 = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
      const cr = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const triCenter = [
        (va[0] + vb[0] + vc[0]) / 3 - cx,
        (va[1] + vb[1] + vc[1]) / 3 - cy,
        (va[2] + vb[2] + vc[2]) / 3 - cz,
      ];
      const dot = cr[0] * triCenter[0] + cr[1] * triCenter[1] + cr[2] * triCenter[2];
      if (dot >= 0) {
        this.indices.push(verts[a].vIdx, verts[bI].vIdx, verts[c].vIdx);
      } else {
        this.indices.push(verts[a].vIdx, verts[c].vIdx, verts[bI].vIdx);
      }
    };
    const emitOutwardQuad = (a, bI, c, d) => {
      emitOutwardTri(a, bI, c);
      emitOutwardTri(a, c, d);
    };

    // 6 main faces
    emitOutwardQuad(vid(4, 2), vid(5, 2), vid(7, 2), vid(6, 2)); // +Z
    emitOutwardQuad(vid(1, 2), vid(0, 2), vid(2, 2), vid(3, 2)); // -Z
    emitOutwardQuad(vid(5, 0), vid(1, 0), vid(3, 0), vid(7, 0)); // +X
    emitOutwardQuad(vid(0, 0), vid(4, 0), vid(6, 0), vid(2, 0)); // -X
    emitOutwardQuad(vid(6, 1), vid(7, 1), vid(3, 1), vid(2, 1)); // +Y
    emitOutwardQuad(vid(0, 1), vid(1, 1), vid(5, 1), vid(4, 1)); // -Y

    // 12 edge chamfers
    // X-parallel edges (join Y-face 1 and Z-face 2)
    emitOutwardQuad(vid(6, 2), vid(7, 2), vid(7, 1), vid(6, 1)); // +Y+Z
    emitOutwardQuad(vid(4, 1), vid(5, 1), vid(5, 2), vid(4, 2)); // -Y+Z
    emitOutwardQuad(vid(2, 1), vid(3, 1), vid(3, 2), vid(2, 2)); // +Y-Z
    emitOutwardQuad(vid(0, 2), vid(1, 2), vid(1, 1), vid(0, 1)); // -Y-Z
    // Y-parallel edges (join X-face 0 and Z-face 2)
    emitOutwardQuad(vid(5, 2), vid(5, 0), vid(7, 0), vid(7, 2)); // +X+Z
    emitOutwardQuad(vid(4, 0), vid(4, 2), vid(6, 2), vid(6, 0)); // -X+Z
    emitOutwardQuad(vid(1, 0), vid(1, 2), vid(3, 2), vid(3, 0)); // +X-Z
    emitOutwardQuad(vid(0, 2), vid(0, 0), vid(2, 0), vid(2, 2)); // -X-Z
    // Z-parallel edges (join X-face 0 and Y-face 1)
    emitOutwardQuad(vid(7, 0), vid(3, 0), vid(3, 1), vid(7, 1)); // +X+Y
    emitOutwardQuad(vid(5, 1), vid(1, 1), vid(1, 0), vid(5, 0)); // +X-Y
    emitOutwardQuad(vid(2, 1), vid(6, 1), vid(6, 0), vid(2, 0)); // -X+Y
    emitOutwardQuad(vid(0, 0), vid(4, 0), vid(4, 1), vid(0, 1)); // -X-Y

    // 8 corner bevel triangles
    for (let c = 0; c < 8; c++) {
      emitOutwardTri(vid(c, 0), vid(c, 1), vid(c, 2));
    }
  }

  /** Indexed vertical cylinder with optional caps and smooth radial normals */
  addCylinder(cx, yBottom, cz, radiusBottom, radiusTop, height, segments = 14, hex = '#ffffff', opts = {}) {
    const yTop = yBottom + height;
    const lin = hexToLinear(hex);
    const aoB = opts.aoBottom ?? 0.82;
    const aoT = opts.aoTop ?? 1.0;
    const ringBot = [];
    const ringTop = [];
    const dy = height;
    const dr = radiusBottom - radiusTop;
    const slantLen = Math.hypot(dy, dr) || 1;
    const nyComp = dr / slantLen;
    const nrComp = dy / slantLen;

    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = ca * nrComp;
      const nz = sa * nrComp;
      const u = (i / segments) * Math.max(radiusBottom, radiusTop, 0.1) * 3;
      ringBot.push(
        this.pushVertex(
          [cx + ca * radiusBottom, yBottom, cz + sa * radiusBottom],
          [nx, nyComp, nz],
          [u, yBottom * 0.5],
          lin,
          aoB,
        ),
      );
      ringTop.push(
        this.pushVertex(
          [cx + ca * radiusTop, yTop, cz + sa * radiusTop],
          [nx, nyComp, nz],
          [u, yTop * 0.5],
          lin,
          aoT,
        ),
      );
    }

    for (let i = 0; i < segments; i++) {
      this.indices.push(ringBot[i], ringTop[i], ringTop[i + 1], ringBot[i], ringTop[i + 1], ringBot[i + 1]);
    }

    if (!opts.noTopCap && radiusTop > 0.002) {
      const centerTop = this.pushVertex([cx, yTop, cz], [0, 1, 0], [cx * 0.45, cz * 0.45], lin, aoT);
      const capRing = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const px = cx + Math.cos(a) * radiusTop;
        const pz = cz + Math.sin(a) * radiusTop;
        capRing.push(this.pushVertex([px, yTop, pz], [0, 1, 0], [px * 0.45, pz * 0.45], lin, aoT));
      }
      for (let i = 0; i < segments; i++) {
        this.indices.push(centerTop, capRing[(i + 1) % segments], capRing[i]);
      }
    }

    if (!opts.noBottomCap && radiusBottom > 0.002) {
      const centerBot = this.pushVertex([cx, yBottom, cz], [0, -1, 0], [cx * 0.45, cz * 0.45], lin, aoB);
      const capRing = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const px = cx + Math.cos(a) * radiusBottom;
        const pz = cz + Math.sin(a) * radiusBottom;
        capRing.push(this.pushVertex([px, yBottom, pz], [0, -1, 0], [px * 0.45, pz * 0.45], lin, aoB));
      }
      for (let i = 0; i < segments; i++) {
        this.indices.push(centerBot, capRing[i], capRing[(i + 1) % segments]);
      }
    }
  }

  /** Horizontal wheel/disc cylinder aligned along X axis (used for EV tires & rims) */
  addWheel(cx, cy, cz, radius, widthX, segments = 18, hex = '#ffffff') {
    const x0 = cx - widthX / 2;
    const x1 = cx + widthX / 2;
    const lin = hexToLinear(hex);
    const r0 = [];
    const r1 = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const py = cy + sa * radius;
      const pz = cz + ca * radius;
      const shade = 0.78 + Math.max(0, sa) * 0.22;
      r0.push(this.pushVertex([x0, py, pz], [0, sa, ca], [0, i / segments], lin, shade));
      r1.push(this.pushVertex([x1, py, pz], [0, sa, ca], [1, i / segments], lin, shade));
    }
    for (let i = 0; i < segments; i++) {
      this.indices.push(r0[i], r1[i], r1[i + 1], r0[i], r1[i + 1], r0[i + 1]);
    }
    // Side discs
    const cLeft = this.pushVertex([x0, cy, cz], [-1, 0, 0], [0.5, 0.5], lin, 0.9);
    const cRight = this.pushVertex([x1, cy, cz], [1, 0, 0], [0.5, 0.5], lin, 0.9);
    const lRing = [];
    const rRing = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const py = cy + sa * radius;
      const pz = cz + ca * radius;
      lRing.push(this.pushVertex([x0, py, pz], [-1, 0, 0], [0.5 + ca * 0.5, 0.5 + sa * 0.5], lin, 0.9));
      rRing.push(this.pushVertex([x1, py, pz], [1, 0, 0], [0.5 + ca * 0.5, 0.5 + sa * 0.5], lin, 0.9));
    }
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      this.indices.push(cLeft, lRing[i], lRing[j]);
      this.indices.push(cRight, rRing[j], rRing[i]);
    }
  }

  /** Indexed Lathe (vessels, cups, teapots, elliptical soaking tub, bowls, round mirrors) */
  addLathe(cx, yBase, cz, profile, segments = 16, hex = '#ffffff', opts = {}) {
    const scaleX = opts.scaleX ?? 1;
    const scaleZ = opts.scaleZ ?? 1;
    const rotY = opts.rotY ?? 0;
    const lin = hexToLinear(hex);
    const rings = [];

    for (let p = 0; p < profile.length; p++) {
      const [r, yOff] = profile[p];
      const prev = profile[Math.max(0, p - 1)];
      const next = profile[Math.min(profile.length - 1, p + 1)];
      const dr = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const tLen = Math.hypot(dr, dy) || 1;
      // Outward normal in radial plane is (dy, -dr) when going bottom->top on outer wall
      const nrLocal = dy / tLen;
      const nyLocal = -dr / tLen;
      const shade = 0.8 + Math.min(0.2, Math.max(0, yOff * 0.35));

      const ring = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const lx = ca * r * scaleX;
        const lz = sa * r * scaleZ;
        const wPos = rotateY(cx + lx, yBase + yOff, cz + lz, cx, cz, rotY);
        // Scale normal appropriately for elliptical lathes
        const nxRaw = (ca / (scaleX || 1)) * nrLocal;
        const nzRaw = (sa / (scaleZ || 1)) * nrLocal;
        const nLen = Math.hypot(nxRaw, nyLocal, nzRaw) || 1;
        const wNorm = rotateNormalY(nxRaw / nLen, nyLocal / nLen, nzRaw / nLen, rotY);
        ring.push(
          this.pushVertex(wPos, wNorm, [i / segments, p / Math.max(1, profile.length - 1)], lin, shade),
        );
      }
      rings.push(ring);
    }

    for (let p = 0; p < rings.length - 1; p++) {
      for (let i = 0; i < segments; i++) {
        const a = rings[p][i];
        const b = rings[p][i + 1];
        const c = rings[p + 1][i + 1];
        const d = rings[p + 1][i];
        this.indices.push(a, d, c, a, c, b);
      }
    }
  }

  /** Swept smooth tube along 3D polyline (Arco lamp stem, gooseneck faucets, charging cable) */
  addTube(points, radius, radialSegs = 8, hex = '#ffffff', opts = {}) {
    if (points.length < 2) return;
    const lin = hexToLinear(hex);
    const rings = [];

    let prevNormal = [0, 1, 0];
    for (let k = 0; k < points.length; k++) {
      const pPrev = points[Math.max(0, k - 1)];
      const pNext = points[Math.min(points.length - 1, k + 1)];
      const tx = pNext[0] - pPrev[0];
      const ty = pNext[1] - pPrev[1];
      const tz = pNext[2] - pPrev[2];
      const tLen = Math.hypot(tx, ty, tz) || 1;
      const tan = [tx / tLen, ty / tLen, tz / tLen];

      // Pick non-collinear seed on first frame
      if (k === 0 && Math.abs(tan[1]) > 0.92) {
        prevNormal = [1, 0, 0];
      }
      // Gram-Schmidt orthogonalize prevNormal against tangent
      const dot = prevNormal[0] * tan[0] + prevNormal[1] * tan[1] + prevNormal[2] * tan[2];
      let bx = prevNormal[0] - dot * tan[0];
      let by = prevNormal[1] - dot * tan[1];
      let bz = prevNormal[2] - dot * tan[2];
      const bLen = Math.hypot(bx, by, bz) || 1;
      const nVec = [bx / bLen, by / bLen, bz / bLen];
      prevNormal = nVec;
      const binorm = [
        tan[1] * nVec[2] - tan[2] * nVec[1],
        tan[2] * nVec[0] - tan[0] * nVec[2],
        tan[0] * nVec[1] - tan[1] * nVec[0],
      ];

      const ring = [];
      const curR = typeof radius === 'function' ? radius(k / (points.length - 1)) : radius;
      for (let i = 0; i <= radialSegs; i++) {
        const a = (i / radialSegs) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = nVec[0] * ca + binorm[0] * sa;
        const ny = nVec[1] * ca + binorm[1] * sa;
        const nz = nVec[2] * ca + binorm[2] * sa;
        const pos = [points[k][0] + nx * curR, points[k][1] + ny * curR, points[k][2] + nz * curR];
        ring.push(this.pushVertex(pos, [nx, ny, nz], [i / radialSegs, k * 0.2], lin, 0.94));
      }
      rings.push(ring);
    }

    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < radialSegs; i++) {
        const a = rings[k][i];
        const b = rings[k][i + 1];
        const c = rings[k + 1][i + 1];
        const d = rings[k + 1][i];
        this.indices.push(a, b, c, a, c, d);
      }
    }

    if (opts.capEnds) {
      const cap = (pt, dirSign, ringIdx) => {
        const p0 = points[ringIdx];
        const p1 = points[ringIdx === 0 ? 1 : points.length - 2];
        const dx = (p0[0] - p1[0]) * dirSign;
        const dy = (p0[1] - p1[1]) * dirSign;
        const dz = (p0[2] - p1[2]) * dirSign;
        const dl = Math.hypot(dx, dy, dz) || 1;
        const norm = [dx / dl, dy / dl, dz / dl];
        const cV = this.pushVertex(pt, norm, [0.5, 0.5], lin, 0.92);
        const ring = rings[ringIdx];
        for (let i = 0; i < radialSegs; i++) {
          if (ringIdx === 0) {
            this.indices.push(cV, ring[i + 1], ring[i]);
          } else {
            this.indices.push(cV, ring[i], ring[i + 1]);
          }
        }
      };
      cap(points[0], 1, 0);
      cap(points[points.length - 1], 1, points.length - 1);
    }
  }

  /** Extrude a closed 2D (z, y) polygon along X (for fastback EV coupe silhouette, diagonal stringers) */
  addExtrudedYZ(cx, widthX, polyYZ, hex = '#ffffff', opts = {}) {
    const x0 = cx - widthX / 2;
    const x1 = cx + widthX / 2;
    const lin = hexToLinear(hex);
    const n = polyYZ.length;

    // Ensure CCW winding in (z, y) plane
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [z0, y0] = polyYZ[i];
      const [z1, y1] = polyYZ[(i + 1) % n];
      area += z0 * y1 - z1 * y0;
    }
    const pts = area >= 0 ? polyYZ : [...polyYZ].reverse();

    // Side perimeter quads
    for (let i = 0; i < n; i++) {
      const [zA, yA] = pts[i];
      const [zB, yB] = pts[(i + 1) % n];
      const dz = zB - zA;
      const dy = yB - yA;
      const len = Math.hypot(dz, dy) || 1;
      const norm = [0, -dz / len, dy / len];
      const sA = Math.min(1, Math.max(0.75, 0.78 + yA * 0.16));
      const sB = Math.min(1, Math.max(0.75, 0.78 + yB * 0.16));
      const p0 = [x0, yA, zA];
      const p1 = [x1, yA, zA];
      const p2 = [x1, yB, zB];
      const p3 = [x0, yB, zB];
      // Check outward against centroid
      const v0 = this.pushVertex(p0, norm, [0, 0], lin, sA);
      const v1 = this.pushVertex(p1, norm, [widthX * 0.45, 0], lin, sA);
      const v2 = this.pushVertex(p2, norm, [widthX * 0.45, len * 0.45], lin, sB);
      const v3 = this.pushVertex(p3, norm, [0, len * 0.45], lin, sB);
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const cr = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      if (cr[0] * norm[0] + cr[1] * norm[1] + cr[2] * norm[2] >= 0) {
        this.indices.push(v0, v1, v2, v0, v2, v3);
      } else {
        this.indices.push(v0, v2, v1, v0, v3, v2);
      }
    }

    if (!opts.noCaps) {
      // Fan triangulate convex/star-shaped end caps from centroid
      let cz = 0;
      let cy = 0;
      for (const [pz, py] of pts) {
        cz += pz;
        cy += py;
      }
      cz /= n;
      cy /= n;
      const leftC = this.pushVertex([x0, cy, cz], [-1, 0, 0], [cz * 0.45, cy * 0.45], lin, 0.92);
      const rightC = this.pushVertex([x1, cy, cz], [1, 0, 0], [cz * 0.45, cy * 0.45], lin, 0.92);
      const leftRing = [];
      const rightRing = [];
      for (const [pz, py] of pts) {
        const s = Math.min(1, Math.max(0.76, 0.78 + py * 0.16));
        leftRing.push(this.pushVertex([x0, py, pz], [-1, 0, 0], [pz * 0.45, py * 0.45], lin, s));
        rightRing.push(this.pushVertex([x1, py, pz], [1, 0, 0], [pz * 0.45, py * 0.45], lin, s));
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.indices.push(leftC, leftRing[i], leftRing[j]);
        this.indices.push(rightC, rightRing[j], rightRing[i]);
      }
    }
  }

  /** Sloped prism / roof-ridge wing from (x0, y0) to (x1, y1) with thickness and depth z0..z1 */
  addSlopedSlab(x0, y0, x1, y1, z0, z1, thickness, hex = '#ffffff') {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = -dy / len;
    const uy = dx / len;
    const ox = ux * thickness;
    const oy = uy * thickness;

    const b0f = [x0, y0, z1];
    const b1f = [x1, y1, z1];
    const t1f = [x1 + ox, y1 + oy, z1];
    const t0f = [x0 + ox, y0 + oy, z1];

    const b0k = [x0, y0, z0];
    const b1k = [x1, y1, z0];
    const t1k = [x1 + ox, y1 + oy, z0];
    const t0k = [x0 + ox, y0 + oy, z0];

    this.addQuad(t0f, t1f, t1k, t0k, [ux, uy, 0], hex);
    this.addQuad(b1f, b0f, b0k, b1k, [-ux, -uy, 0], hex, { s0: 0.85, s1: 0.85, s2: 0.85, s3: 0.85 });
    this.addQuad(b0f, b1f, t1f, t0f, [0, 0, 1], hex);
    this.addQuad(b1k, b0k, t0k, t1k, [0, 0, -1], hex);
    this.addQuad(b0k, b0f, t0f, t0k, [-dx / len, -dy / len, 0], hex);
    this.addQuad(b1f, b1k, t1k, t1f, [dx / len, dy / len, 0], hex);
  }

  /** Low-poly organic foliage cluster with sun-dappled top-to-bottom shading */
  addFoliageCluster(cx, cy, cz, rx, ry, rz, hex = PALETTE.oliveLeaf, latSegs = 6, lonSegs = 9) {
    const lin = hexToLinear(hex);
    const grid = [];
    for (let lat = 0; lat <= latSegs; lat++) {
      const t = (lat / latSegs) * Math.PI;
      const st = Math.sin(t);
      const ct = Math.cos(t);
      const row = [];
      for (let lon = 0; lon <= lonSegs; lon++) {
        const p = (lon / lonSegs) * Math.PI * 2;
        const wobble = 1 + 0.08 * Math.sin(p * 3 + lat * 1.7) * st;
        const px = cx + st * Math.cos(p) * rx * wobble;
        const py = cy + ct * ry * (1 + 0.04 * Math.cos(p * 2));
        const pz = cz + st * Math.sin(p) * rz * wobble;
        const nx = (st * Math.cos(p)) / (rx || 1);
        const ny = ct / (ry || 1);
        const nz = (st * Math.sin(p)) / (rz || 1);
        const nl = Math.hypot(nx, ny, nz) || 1;
        const shade = 0.68 + (ct * 0.5 + 0.5) * 0.36;
        row.push(
          this.pushVertex(
            [px, py, pz],
            [nx / nl, ny / nl, nz / nl],
            [lon / lonSegs, lat / latSegs],
            lin,
            shade,
          ),
        );
      }
      grid.push(row);
    }
    for (let lat = 0; lat < latSegs; lat++) {
      for (let lon = 0; lon < lonSegs; lon++) {
        const a = grid[lat][lon];
        const b = grid[lat + 1][lon];
        const c = grid[lat + 1][lon + 1];
        const d = grid[lat][lon + 1];
        if (lat !== 0) this.indices.push(a, c, b);
        if (lat !== latSegs - 1) this.indices.push(a, d, c);
      }
    }
  }
}

const buckets = new Map();
function getBucket(matName) {
  const matDef = MATERIALS.find((m) => m.name === matName);
  if (!matDef) throw new Error(`Unknown material bucket: ${matName}`);
  if (!buckets.has(matName)) {
    buckets.set(matName, new MeshBucket(matName, matDef));
  }
  return buckets.get(matName);
}

/** Add a slab spanning [x0..x1, z0..z1] with a rectangular stairwell opening subtracted cleanly */
function addSlabWithStairWell(bucketObj, x0, x1, yMid, thickness, z0, z1, well, hex, opts = {}) {
  // South strip (front of stairwell)
  if (z1 > well.z1) {
    bucketObj.addBox((x0 + x1) / 2, yMid, (well.z1 + z1) / 2, x1 - x0, thickness, z1 - well.z1, hex, opts);
  }
  // North strip (behind stairwell)
  if (z0 < well.z0) {
    bucketObj.addBox((x0 + x1) / 2, yMid, (z0 + well.z0) / 2, x1 - x0, thickness, well.z0 - z0, hex, opts);
  }
  // West wing beside stairwell
  if (x0 < well.x0) {
    bucketObj.addBox(
      (x0 + well.x0) / 2,
      yMid,
      (well.z0 + well.z1) / 2,
      well.x0 - x0,
      thickness,
      well.z1 - well.z0,
      hex,
      opts,
    );
  }
  // East wing beside stairwell
  if (x1 > well.x1) {
    bucketObj.addBox(
      (well.x1 + x1) / 2,
      yMid,
      (well.z0 + well.z1) / 2,
      x1 - well.x1,
      thickness,
      well.z1 - well.z0,
      hex,
      opts,
    );
  }
}

function addBookRow(woodBucket, softBucket, xStart, yBottom, zCenter, count, dirAxis = 'x', seed = 0) {
  const bookColors = [
    PALETTE.bookCream,
    PALETTE.bookSlate,
    PALETTE.bookRust,
    PALETTE.bookSage,
    PALETTE.terracotta,
    PALETTE.charcoalFabric,
  ];
  let cursor = xStart;
  for (let i = 0; i < count; i++) {
    const thick = 0.032 + ((i + seed) % 3) * 0.011;
    const h = 0.21 + ((i * 5 + seed) % 4) * 0.025;
    const d = 0.16 + ((i + seed) % 2) * 0.02;
    const col = bookColors[(i + seed) % bookColors.length];
    const target = i % 2 === 0 ? softBucket : woodBucket;
    if (dirAxis === 'x') {
      target.addBox(cursor + thick / 2, yBottom + h / 2, zCenter, thick, h, d, col, {
        cullBottom: true,
        aoBottom: 0.72,
      });
    } else {
      target.addBox(zCenter, yBottom + h / 2, cursor + thick / 2, d, h, thick, col, {
        cullBottom: true,
        aoBottom: 0.72,
      });
    }
    cursor += thick + 0.008;
  }
}

function addWallSwitch86(metalBucket, surfaceBucket, x, y, z, facing = '+z') {
  if (facing === '+z' || facing === '-z') {
    const dir = facing === '+z' ? 1 : -1;
    metalBucket.addBox(x, y, z + dir * 0.006, 0.095, 0.095, 0.012, PALETTE.bronze);
    surfaceBucket.addBox(x, y, z + dir * 0.013, 0.078, 0.078, 0.008, PALETTE.darkMetal);
  } else {
    const dir = facing === '+x' ? 1 : -1;
    metalBucket.addBox(x + dir * 0.006, y, z, 0.012, 0.095, 0.095, PALETTE.bronze);
    surfaceBucket.addBox(x + dir * 0.013, y, z, 0.008, 0.078, 0.078, PALETTE.darkMetal);
  }
}

// ============================================================================
// 1. SITE PLINTH, TERRACE DECKS, REFLECTING POOL & GARDEN PERIMETER
// ============================================================================
function buildSite() {
  const stone = getBucket('ShellStone');
  const metal = getBucket('ShellMetal');
  const pathEmit = getBucket('Emit_CourtyardPath');
  const foliage = getBucket('Foliage');

  // Outer stepped dark basalt foundation plinth
  stone.addBox(0.5, -0.34, 0.6, 24.4, 0.36, 16.4, PALETTE.basalt, { cullBottom: true, aoBottom: 0.65 });
  stone.addBox(0.5, -0.12, -0.8, 22.6, 0.16, 12.6, PALETTE.basaltMid, { cullBottom: true, aoBottom: 0.72 });

  // Perimeter architectural landscape low walls (frame villa cleanly without blocking views)
  stone.addBox(0.5, 0.1, -7.25, 24.0, 0.56, 0.34, PALETTE.basalt, { aoBottom: 0.68 });
  stone.addBox(-11.45, 0.06, 0.4, 0.34, 0.48, 15.6, PALETTE.basalt, { aoBottom: 0.68 });
  stone.addBox(12.45, 0.06, -2.2, 0.34, 0.48, 10.4, PALETTE.basalt, { aoBottom: 0.68 });

  // Pool basin & coping around reflecting pool (X: -10.2..+3.2, Z: +3.5..+7.3)
  stone.addBox(-3.5, -0.2, 5.4, 13.8, 0.08, 4.0, PALETTE.basalt, { cullBottom: true });
  stone.addBox(-3.5, -0.05, 7.35, 14.0, 0.24, 0.28, PALETTE.basaltMid, { aoBottom: 0.7 });
  stone.addBox(-10.35, -0.05, 5.4, 0.28, 0.24, 4.1, PALETTE.basaltMid, { aoBottom: 0.7 });
  stone.addBox(3.35, -0.05, 5.4, 0.28, 0.24, 4.1, PALETTE.basaltMid, { aoBottom: 0.7 });

  // Main Travertine Terrace Deck & East Courtyard Deck
  stone.addBox(-0.4, -0.04, -0.4, 17.6, 0.12, 7.8, PALETTE.travertine, { cullBottom: true, aoBottom: 0.74 });
  stone.addBox(7.6, -0.04, 4.9, 8.2, 0.12, 4.6, PALETTE.travertine, { cullBottom: true, aoBottom: 0.74 });

  // Floating Travertine Stepping Stones across reflecting pool to Front Door
  for (let i = 0; i < 4; i++) {
    const sx = 0.75 + (i % 2) * 0.14;
    const sz = 7.0 - i * 1.05;
    stone.addBox(sx, -0.09, sz, 0.9, 0.14, 0.5, PALETTE.basalt, { cullBottom: true });
    stone.addChamferBox(sx, 0.015, sz, 1.38, 0.09, 0.76, 0.02, PALETTE.travertine, { aoBottom: 0.76 });
    pathEmit.addBox(sx, -0.032, sz, 1.18, 0.016, 0.58);
  }

  // Sculptural Basalt Planter + Olive Tree + Shrubs
  stone.addBox(-10.15, 0.18, 4.35, 1.72, 0.42, 1.72, PALETTE.basalt, { aoBottom: 0.7 });
  stone.addBox(-10.15, 0.36, 4.35, 1.48, 0.08, 1.48, PALETTE.soil, { cullBottom: true });

  const wood = getBucket('ShellWood');
  wood.addCylinder(-10.15, 0.38, 4.35, 0.19, 0.12, 2.05, 10, PALETTE.walnutDark, { noBottomCap: true });
  wood.addCylinder(-9.82, 1.52, 4.15, 0.09, 0.05, 1.2, 8, PALETTE.walnutDark, { noBottomCap: true });
  wood.addCylinder(-10.45, 1.58, 4.55, 0.08, 0.05, 1.15, 8, PALETTE.walnutDark, { noBottomCap: true });
  wood.addCylinder(-10.05, 1.85, 4.68, 0.07, 0.04, 0.95, 8, PALETTE.walnutDark, { noBottomCap: true });

  foliage.addFoliageCluster(-10.15, 3.05, 4.35, 1.32, 0.64, 1.24, PALETTE.oliveLeaf, 8, 12);
  foliage.addFoliageCluster(-9.52, 2.66, 4.02, 0.94, 0.48, 0.88, PALETTE.oliveLeafLight, 8, 12);
  foliage.addFoliageCluster(-10.68, 2.74, 4.65, 0.92, 0.46, 0.86, PALETTE.oliveLeaf, 8, 12);
  foliage.addFoliageCluster(-9.98, 2.95, 4.95, 0.78, 0.4, 0.74, PALETTE.oliveLeafLight, 8, 12);

  // Ornamental low garden shrubs & pool water lilies
  for (const [sx, sz, rx, rz] of [
    [-10.62, 1.9, 0.42, 1.05],
    [-10.62, -0.4, 0.4, 0.98],
    [-10.62, -2.8, 0.44, 1.15],
    [11.9, -2.5, 0.46, 1.2],
  ]) {
    foliage.addFoliageCluster(sx, 0.22, sz, rx, 0.34, rz, PALETTE.shrubLeaf, 5, 8);
  }
  // Pool lily pads & basalt stepping rocks at west pool zone
  for (const [lx, lz, lr] of [
    [-7.6, 5.1, 0.28],
    [-7.15, 5.55, 0.22],
    [-6.65, 5.05, 0.25],
    [-4.3, 6.2, 0.24],
    [-3.85, 5.85, 0.2],
  ]) {
    foliage.addCylinder(lx, -0.015, lz, lr, lr, 0.018, 10, PALETTE.lilyPad, { noBottomCap: true });
  }
  stone.addChamferBox(-8.2, 0.02, 5.9, 0.58, 0.24, 0.46, 0.08, PALETTE.basalt, { rotY: 0.35 });
  stone.addChamferBox(-7.75, -0.03, 6.25, 0.38, 0.16, 0.34, 0.06, PALETTE.basaltMid, { rotY: -0.2 });

  // Pathway Bollard Lights (light.courtyard_path)
  for (const [bx, bz] of [
    [2.1, 6.6],
    [2.1, 4.3],
    [6.8, 3.9],
    [10.8, 3.2],
  ]) {
    metal.addCylinder(bx, 0.02, bz, 0.07, 0.07, 0.56, 12, PALETTE.bronze, { noBottomCap: true });
    metal.addCylinder(bx, 0.69, bz, 0.072, 0.072, 0.03, 12, PALETTE.bronze);
    pathEmit.addCylinder(bx, 0.58, bz, 0.064, 0.064, 0.11, 12);
  }
}

// ============================================================================
// 2. GROUND FLOOR STRUCTURE, STAIRWELL OPENING, DOORS & GLAZING
// ============================================================================
const STAIR_WELL = { x0: -0.92, x1: 2.38, z0: -4.02, z1: -2.42 };

function buildGroundStructure() {
  const stone = getBucket('ShellStone');
  const wood = getBucket('ShellWood');
  const metal = getBucket('ShellMetal');
  const glass = getBucket('ArchitecturalGlass');
  const surf = getBucket('InteriorSurface');

  // Interior Floors (top y = 0.05; Garage concrete top y = 0.04)
  wood.addBox(-4.85, 0.03, -0.42, 7.3, 0.04, 7.22, PALETTE.walnut, { cullBottom: true });
  stone.addBox(0.7, 0.03, -0.42, 3.8, 0.04, 7.22, PALETTE.travertine, { cullBottom: true });
  stone.addBox(5.1, 0.03, -0.42, 5.0, 0.04, 7.22, PALETTE.travertine, { cullBottom: true });
  stone.addBox(9.45, 0.025, -0.82, 3.55, 0.03, 6.45, PALETTE.basaltMid, { cullBottom: true });

  // North Rear Architectural Spine Wall (y = 0.02 .. 3.175 so zero coplanar Z-fighting with ceiling slab)
  stone.addBox(1.4, 1.595, -4.2, 20.1, 3.15, 0.34, PALETTE.travertine, { aoBottom: 0.72 });
  // Living West Feature Stone Wall
  stone.addBox(-8.55, 1.595, -2.36, 0.32, 3.15, 3.34, PALETTE.travertine, { aoBottom: 0.72 });

  // Slatted Walnut Acoustic Feature Wall (Living Room Rear, shifted right of bookshelf niche)
  for (let i = 0; i < 16; i++) {
    wood.addBox(-6.65 + i * 0.3, 1.59, -3.99, 0.11, 3.06, 0.07, PALETTE.walnut, { aoBottom: 0.75 });
  }

  // Interior Partitions with Walnut Portal Jambs & Overhead Lintels
  // Living <-> Hall at X = -1.2
  stone.addBox(-1.2, 1.59, -2.66, 0.18, 3.1, 2.74, PALETTE.plaster, { aoBottom: 0.76 });
  wood.addBox(-1.2, 1.59, -1.27, 0.21, 3.1, 0.06, PALETTE.walnutDark);
  wood.addBox(-1.2, 3.05, 0.94, 0.18, 0.16, 4.38, PALETTE.walnutDark); // open portal beam

  // Hall <-> Kitchen at X = +2.6 + Divider Fin at Z = 1.15..2.05 (mounts Home Security Panel!)
  stone.addBox(2.6, 1.59, -2.56, 0.18, 3.1, 2.94, PALETTE.plaster, { aoBottom: 0.76 });
  wood.addBox(2.6, 1.59, -1.07, 0.21, 3.1, 0.06, PALETTE.walnutDark);
  stone.addBox(2.58, 1.59, 1.6, 0.18, 3.1, 0.92, PALETTE.plaster, { aoBottom: 0.76 });
  wood.addBox(2.58, 1.59, 1.13, 0.21, 3.1, 0.04, PALETTE.walnutDark);
  wood.addBox(2.58, 1.59, 2.07, 0.21, 3.1, 0.04, PALETTE.walnutDark);
  wood.addBox(2.58, 3.05, 0.04, 0.18, 0.16, 2.18, PALETTE.walnutDark);

  // Kitchen <-> Garage & Garage Shell
  stone.addBox(7.6, 1.595, -0.82, 0.3, 3.15, 6.5, PALETTE.travertine, { aoBottom: 0.74 });
  stone.addBox(11.35, 1.595, -0.82, 0.32, 3.15, 6.5, PALETTE.travertine, { aoBottom: 0.74 });
  stone.addBox(9.5, 3.24, -0.8, 4.1, 0.24, 7.2, PALETTE.travertine);
  metal.addBox(9.5, 2.84, 2.38, 3.4, 0.5, 0.24, PALETTE.bronze);

  // Interior Dark Bronze Shadow-Gap Baseboards
  metal.addBox(-4.85, 0.08, -4.01, 7.1, 0.06, 0.02, PALETTE.bronze);
  metal.addBox(-8.38, 0.08, -2.35, 0.02, 0.06, 3.3, PALETTE.bronze);
  metal.addBox(5.1, 0.08, -4.01, 4.8, 0.06, 0.02, PALETTE.bronze);
  metal.addBox(7.44, 0.08, -0.8, 0.02, 0.06, 6.4, PALETTE.bronze);

  // Ground Ceiling / Mid-Level Slab (Y: 3.175..3.385) & Walnut Soffit (Y: 3.125..3.175) WITH STAIRWELL CUTOUT
  addSlabWithStairWell(stone, -9.2, 8.6, 3.28, 0.21, -4.45, 3.65, STAIR_WELL, PALETTE.travertine);
  addSlabWithStairWell(wood, -9.05, 8.45, 3.15, 0.05, -4.35, 3.55, STAIR_WELL, PALETTE.walnut);

  // Stairwell Void Rim Fascia (clean architectural trim around opening)
  wood.addBox(
    0.73,
    3.28,
    STAIR_WELL.z1 + 0.03,
    STAIR_WELL.x1 - STAIR_WELL.x0 + 0.12,
    0.32,
    0.06,
    PALETTE.walnut,
  );
  wood.addBox(STAIR_WELL.x0 - 0.03, 3.28, -3.22, 0.06, 0.32, STAIR_WELL.z1 - STAIR_WELL.z0, PALETTE.walnut);
  wood.addBox(STAIR_WELL.x1 + 0.03, 3.28, -3.22, 0.06, 0.32, STAIR_WELL.z1 - STAIR_WELL.z0, PALETTE.walnut);

  // Living Room South & West Single-Plane Curtain Glass + Transom + Mullions + Curtain Pelmet
  glass.addGlassPane(
    [-8.45, 0.08, 3.18],
    [-1.26, 0.08, 3.18],
    [-1.26, 3.1, 3.18],
    [-8.45, 3.1, 3.18],
    [0, 0, 1],
  );
  glass.addGlassPane(
    [-8.52, 0.08, -0.7],
    [-8.52, 0.08, 3.18],
    [-8.52, 3.1, 3.18],
    [-8.52, 3.1, -0.7],
    [-1, 0, 0],
  );
  for (const x of [-8.52, -6.7, -4.85, -3.0, -1.25]) {
    metal.addBox(x, 1.59, 3.19, 0.065, 3.12, 0.09, PALETTE.bronze);
  }
  metal.addBox(-8.52, 1.59, -0.7, 0.065, 3.12, 0.09, PALETTE.bronze);
  metal.addBox(-4.85, 3.11, 3.19, 7.38, 0.08, 0.11, PALETTE.bronze);
  metal.addBox(-4.85, 0.06, 3.19, 7.38, 0.08, 0.11, PALETTE.bronze);
  metal.addBox(-4.85, 2.42, 3.19, 7.25, 0.035, 0.07, PALETTE.bronze); // architectural transom bar
  metal.addBox(-8.52, 3.11, 1.24, 0.11, 0.08, 3.92, PALETTE.bronze);
  metal.addBox(-8.52, 0.06, 1.24, 0.11, 0.08, 3.92, PALETTE.bronze);
  metal.addBox(-8.52, 2.42, 1.24, 0.07, 0.035, 3.88, PALETTE.bronze);
  // Living Curtain Pelmet Box & Track (for motorized sheer drapery at Z=3.08)
  wood.addBox(-4.85, 3.11, 3.07, 7.1, 0.09, 0.16, PALETTE.walnutDark);
  metal.addBox(-4.85, 3.06, 3.08, 7.04, 0.025, 0.04, PALETTE.bronze);

  // Entrance Hall Glass Sidelights & Pivoting Walnut Front Door
  glass.addGlassPane(
    [-1.16, 0.08, 3.18],
    [0.22, 0.08, 3.18],
    [0.22, 3.1, 3.18],
    [-1.16, 3.1, 3.18],
    [0, 0, 1],
  );
  glass.addGlassPane([1.34, 0.08, 3.18], [2.54, 0.08, 3.18], [2.54, 3.1, 3.18], [1.34, 3.1, 3.18], [0, 0, 1]);
  metal.addBox(0.22, 1.59, 3.19, 0.06, 3.12, 0.09, PALETTE.bronze);
  metal.addBox(1.34, 1.59, 3.19, 0.06, 3.12, 0.09, PALETTE.bronze);
  metal.addBox(0.7, 3.11, 3.19, 3.82, 0.08, 0.11, PALETTE.bronze);
  metal.addBox(0.7, 0.06, 3.19, 3.82, 0.08, 0.11, PALETTE.bronze);
  // Pivot Walnut Front Door + Architectural Pull + Smart Lock Escutcheon
  wood.addBox(0.78, 1.52, 3.18, 1.08, 2.94, 0.09, PALETTE.walnut, { aoBottom: 0.76 });
  metal.addBox(0.78, 3.01, 3.19, 1.14, 0.08, 0.11, PALETTE.bronze);
  metal.addBox(1.22, 1.5, 3.26, 0.036, 1.24, 0.045, PALETTE.brass); // pull bar
  metal.addBox(1.18, 1.24, 3.25, 0.12, 0.28, 0.035, PALETTE.darkMetal); // smart lock escutcheon
  surf.addBox(1.18, 1.3, 3.27, 0.07, 0.11, 0.008, PALETTE.oledScreen); // keypad glass

  // Kitchen South Curtain Glass + Mullions + Cedar Sun Louvers
  glass.addGlassPane([2.64, 0.08, 3.18], [7.48, 0.08, 3.18], [7.48, 3.1, 3.18], [2.64, 3.1, 3.18], [0, 0, 1]);
  for (const x of [2.65, 4.3, 5.95, 7.52]) {
    metal.addBox(x, 1.59, 3.19, 0.065, 3.12, 0.09, PALETTE.bronze);
  }
  metal.addBox(5.1, 3.11, 3.19, 4.92, 0.08, 0.11, PALETTE.bronze);
  metal.addBox(5.1, 0.06, 3.19, 4.92, 0.08, 0.11, PALETTE.bronze);
  metal.addBox(5.1, 2.42, 3.19, 4.86, 0.035, 0.07, PALETTE.bronze);
  for (let i = 0; i < 7; i++) {
    wood.addBox(6.1 + i * 0.22, 1.59, 3.36, 0.06, 3.08, 0.18, PALETTE.cedar, { aoBottom: 0.78 });
  }
}

// ============================================================================
// 3. UPPER FLOOR CANTILEVERED MASTER SUITE, TERRACE & ROOF-RIDGE CANOPY
// ============================================================================
function buildUpperStructure() {
  const stone = getBucket('ShellStone');
  const wood = getBucket('ShellWood');
  const metal = getBucket('ShellMetal');
  const glass = getBucket('ArchitecturalGlass');
  const warmAccent = getBucket('Emit_WarmAccent');

  // Master Suite Hardwood Floor (Y: 3.385..3.445) WITH STAIRWELL CUTOUT
  addSlabWithStairWell(wood, -7.8, 2.84, 3.415, 0.06, -4.02, 2.86, STAIR_WELL, PALETTE.walnut);

  // Rear & West Architectural Stone Walls of Master Suite
  stone.addBox(-2.45, 4.91, -4.05, 10.7, 2.95, 0.28, PALETTE.travertine, { aoBottom: 0.76 });
  stone.addBox(-7.7, 4.91, -2.08, 0.28, 2.95, 3.92, PALETTE.travertine, { aoBottom: 0.76 });

  // Interior Dark Bronze Baseboards (Upper Suite)
  metal.addBox(-4.35, 3.475, -3.9, 6.75, 0.06, 0.02, PALETTE.bronze);
  metal.addBox(-7.55, 3.475, -2.08, 0.02, 0.06, 3.65, PALETTE.bronze);

  // Vertical Cedar Privacy Screen on West Cantilever
  for (let i = 0; i < 9; i++) {
    wood.addBox(-7.74, 4.9, -0.05 + i * 0.34, 0.08, 2.94, 0.14, PALETTE.cedar, { aoBottom: 0.78 });
  }

  // Master Suite South & East Single-Plane Panoramic Glass + East Sliding Terrace Door
  glass.addGlassPane(
    [-7.65, 3.46, 2.82],
    [2.82, 3.46, 2.82],
    [2.82, 6.32, 2.82],
    [-7.65, 6.32, 2.82],
    [0, 0, 1],
  );
  glass.addGlassPane(
    [2.82, 3.46, -3.92],
    [2.82, 3.46, 2.82],
    [2.82, 6.32, 2.82],
    [2.82, 6.32, -3.92],
    [1, 0, 0],
  );
  for (const x of [-7.65, -5.1, -2.45, 0.2, 2.82]) {
    metal.addBox(x, 4.9, 2.83, 0.065, 2.94, 0.09, PALETTE.bronze);
  }
  metal.addBox(-2.45, 5.75, 2.83, 10.45, 0.035, 0.07, PALETTE.bronze);
  metal.addBox(-2.45, 3.47, 2.83, 10.52, 0.06, 0.1, PALETTE.bronze);
  metal.addBox(-2.45, 6.34, 2.83, 10.52, 0.08, 0.1, PALETTE.bronze);
  // East terrace sliding door frames + vertical handle
  for (const z of [-3.92, -1.65, 0.25, 1.55, 2.82]) {
    metal.addBox(2.82, 4.9, z, 0.09, 2.94, 0.065, PALETTE.bronze);
  }
  metal.addBox(2.82, 3.47, -0.55, 0.1, 0.06, 6.8, PALETTE.bronze);
  metal.addBox(2.82, 6.34, -0.55, 0.1, 0.08, 6.8, PALETTE.bronze);
  metal.addBox(2.88, 4.55, 1.48, 0.035, 0.72, 0.035, PALETTE.brass); // terrace sliding door handle

  // Bedroom Curtain Pelmet Box & Track (for motorized blackout drapery at Z=2.72)
  wood.addBox(-2.45, 6.31, 2.71, 10.35, 0.09, 0.16, PALETTE.walnutDark);
  metal.addBox(-2.45, 6.26, 2.72, 10.28, 0.025, 0.04, PALETTE.bronze);

  // Upper East Rooftop Terrace Deck & Glass Balustrade
  wood.addBox(5.18, 3.415, -0.42, 4.56, 0.06, 6.56, PALETTE.cedar);
  glass.addGlassPane(
    [2.88, 3.46, 2.85],
    [7.46, 3.46, 2.85],
    [7.46, 4.42, 2.85],
    [2.88, 4.42, 2.85],
    [0, 0, 1],
  );
  glass.addGlassPane(
    [7.45, 3.46, -3.72],
    [7.45, 3.46, 2.85],
    [7.45, 4.42, 2.85],
    [7.45, 4.42, -3.72],
    [1, 0, 0],
  );
  glass.addGlassPane(
    [2.88, 3.46, -3.72],
    [7.45, 3.46, -3.72],
    [7.45, 4.42, -3.72],
    [2.88, 4.42, -3.72],
    [0, 0, -1],
  );
  metal.addBox(5.17, 4.43, 2.85, 4.62, 0.05, 0.07, PALETTE.bronze);
  metal.addBox(7.45, 4.43, -0.44, 0.07, 0.05, 6.62, PALETTE.bronze);
  metal.addBox(5.17, 4.43, -3.72, 4.62, 0.05, 0.07, PALETTE.bronze);

  // ICONIC CANGZE ROOF-RIDGE CANOPY
  wood.addBox(-7.95, 6.46, -0.55, 2.35, 0.18, 8.2, PALETTE.walnut);
  wood.addSlopedSlab(-6.85, 6.38, -2.4, 7.62, -4.65, 3.55, 0.2, PALETTE.walnut);
  wood.addSlopedSlab(-2.4, 7.62, 2.05, 6.38, -4.65, 3.55, 0.2, PALETTE.walnut);
  wood.addBox(3.2, 6.46, -0.55, 2.35, 0.18, 8.2, PALETTE.walnut);

  metal.addBox(-7.95, 6.56, 3.56, 2.38, 0.07, 0.08, PALETTE.bronze);
  metal.addSlopedSlab(-6.85, 6.54, -2.4, 7.78, 3.51, 3.59, 0.07, PALETTE.bronze);
  metal.addSlopedSlab(-2.4, 7.78, 2.05, 6.54, 3.51, 3.59, 0.07, PALETTE.bronze);
  metal.addBox(3.2, 6.56, 3.56, 2.38, 0.07, 0.08, PALETTE.bronze);

  // Clerestory single-plane gable glass + bronze king-post + warm ridge hearth light
  glass.addTriangle([-6.85, 6.38, 2.82], [2.05, 6.38, 2.82], [-2.4, 7.6, 2.82], [0, 0, 1]);
  metal.addBox(-2.4, 6.98, 2.83, 0.065, 1.22, 0.09, PALETTE.bronze);
  metal.addBox(-2.4, 6.36, 2.83, 9.1, 0.06, 0.09, PALETTE.bronze);
  warmAccent.addBox(-2.4, 7.52, -0.55, 0.14, 0.05, 6.4);
}

// ============================================================================
// 4. FLOATING STAIRCASE & UPPER STAIRWELL BALUSTRADE
// ============================================================================
function buildStaircaseClean() {
  const intWood = getBucket('InteriorWood');
  const metal = getBucket('ShellMetal');
  const glass = getBucket('ArchitecturalGlass');

  // Twin architectural sloped steel stringers underneath floating walnut treads
  metal.addSlopedSlab(-0.75, 0.08, 2.18, 3.16, -3.42, -3.32, 0.12, PALETTE.bronze);
  metal.addSlopedSlab(-0.75, 0.08, 2.18, 3.16, -2.98, -2.88, 0.12, PALETTE.bronze);

  // 12 Solid Walnut Floating Treads + Bronze Support Brackets
  for (let step = 0; step < 12; step++) {
    const sx = -0.65 + step * 0.25;
    const sy = 0.26 + step * 0.27;
    intWood.addBox(sx, sy, -3.15, 0.34, 0.075, 1.06, PALETTE.walnut, { aoBottom: 0.72 });
    metal.addBox(sx, sy - 0.06, -3.15, 0.26, 0.045, 0.56, PALETTE.bronze);
  }

  // Diagonal glass stair guard along South face (Z = -2.60) + bronze handrail
  const g0 = [-0.72, 0.26, -2.6];
  const g1 = [2.22, 3.44, -2.6];
  const g2 = [2.22, 4.38, -2.6];
  const g3 = [-0.72, 1.2, -2.6];
  glass.addGlassPane(g0, g1, g2, g3, [0, 0, 1]);
  metal.addSlopedSlab(-0.76, 1.18, 2.24, 4.38, -2.635, -2.565, 0.055, PALETTE.bronze);

  // Upper Floor L-shaped Stairwell Balustrade (leaves East landing X: +1.55..+2.38 open)
  glass.addGlassPane(
    [-0.92, 3.45, -2.42],
    [1.56, 3.45, -2.42],
    [1.56, 4.38, -2.42],
    [-0.92, 4.38, -2.42],
    [0, 0, 1],
  );
  glass.addGlassPane(
    [-0.92, 3.45, -4.0],
    [-0.92, 3.45, -2.42],
    [-0.92, 4.38, -2.42],
    [-0.92, 4.38, -4.0],
    [1, 0, 0],
  );
  metal.addBox(0.32, 4.4, -2.42, 2.54, 0.05, 0.07, PALETTE.bronze);
  metal.addBox(-0.92, 4.4, -3.21, 0.07, 0.05, 1.62, PALETTE.bronze);
  metal.addBox(1.56, 3.92, -2.42, 0.05, 0.94, 0.05, PALETTE.bronze);
}

// ============================================================================
// 5. ROOM 1: LIVING PAVILION (TV, Soundbar, Fireplace, Sofa, Tea Set, Bookshelf, Fig, Lamp)
// ============================================================================
function buildLivingRoom() {
  const stone = getBucket('InteriorSurface');
  const wood = getBucket('InteriorWood');
  const soft = getBucket('InteriorSoft');
  const metal = getBucket('InteriorMetal');
  const foliage = getBucket('Foliage');
  const ceilEmit = getBucket('Emit_LivingCeiling');
  const lampEmit = getBucket('Emit_LivingLamp');
  const warmEmit = getBucket('Emit_WarmAccent');

  // Living Ceiling Recessed Linear Light Cove (light.living_ceiling)
  ceilEmit.addBox(-4.85, 3.11, -0.45, 2.8, 0.04, 0.14);
  // Living Rear Recessed Climate Diffuser & Wall Switch
  metal.addBox(-4.85, 2.94, -3.96, 1.85, 0.12, 0.08, PALETTE.bronze);
  addWallSwitch86(metal, stone, -1.3, 1.38, -1.45, '-x');

  // Woven Area Rug with Border
  soft.addBox(-4.85, 0.056, -0.35, 4.65, 0.014, 3.7, PALETTE.linenWarm, { cullBottom: true, aoBottom: 0.78 });
  soft.addBox(-4.85, 0.064, -0.35, 4.42, 0.012, 3.48, PALETTE.linen, { cullBottom: true });

  // Segmented Rounded L-Shaped Modular Bouclé Sofa
  wood.addBox(-4.8, 0.11, -1.55, 3.45, 0.1, 1.06, PALETTE.walnutDark, { aoBottom: 0.65 });
  wood.addBox(-6.05, 0.11, -0.32, 1.06, 0.1, 1.48, PALETTE.walnutDark, { aoBottom: 0.65 });
  // 3 main seat cushions + chaise cushion
  for (let i = 0; i < 3; i++) {
    soft.addChamferBox(-5.85 + i * 1.06, 0.3, -1.5, 1.02, 0.24, 0.94, 0.055, PALETTE.linen, {
      aoBottom: 0.78,
    });
  }
  soft.addChamferBox(-6.05, 0.3, -0.32, 0.96, 0.24, 1.42, 0.055, PALETTE.linen, { aoBottom: 0.78 });
  // Backrests & wide padded armrests
  for (let i = 0; i < 3; i++) {
    soft.addChamferBox(-5.85 + i * 1.06, 0.6, -1.94, 1.02, 0.44, 0.22, 0.05, PALETTE.linenWarm, {
      aoBottom: 0.8,
    });
  }
  soft.addChamferBox(-6.45, 0.44, -1.0, 0.24, 0.48, 2.08, 0.05, PALETTE.linenWarm, { aoBottom: 0.78 });
  soft.addChamferBox(-3.18, 0.44, -1.54, 0.24, 0.48, 1.04, 0.05, PALETTE.linenWarm, { aoBottom: 0.78 });
  // Draped throw blanket & accent pillows
  soft.addChamferBox(-6.02, 0.43, -0.05, 0.86, 0.04, 0.76, 0.015, PALETTE.charcoalFabric);
  soft.addChamferBox(-3.58, 0.56, -1.68, 0.44, 0.34, 0.18, 0.045, PALETTE.charcoalFabric, { rotY: -0.18 });
  soft.addChamferBox(-3.98, 0.52, -1.65, 0.36, 0.28, 0.16, 0.04, PALETTE.terracotta, { rotY: 0.12 });
  soft.addChamferBox(-6.02, 0.56, -1.68, 0.44, 0.34, 0.18, 0.045, PALETTE.terracotta, { rotY: 0.22 });

  // Sculptural Lounge Armchair & Round Bronze Side Table (East side of Living Rug)
  wood.addBox(-2.45, 0.24, -0.22, 0.72, 0.06, 0.72, PALETTE.walnutDark, { rotY: -0.48 });
  for (const [lx, lz] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ]) {
    const [wx, , wz] = rotateY(-2.45 + lx, 0.14, -0.22 + lz, -2.45, -0.22, -0.48);
    wood.addCylinder(wx, 0.05, wz, 0.025, 0.02, 0.2, 8, PALETTE.walnutDark);
  }
  soft.addChamferBox(-2.45, 0.34, -0.22, 0.68, 0.16, 0.68, 0.045, PALETTE.linenWarm, { rotY: -0.48 });
  soft.addChamferBox(-2.3, 0.62, -0.48, 0.66, 0.42, 0.18, 0.045, PALETTE.linenWarm, { rotY: -0.48 });
  // Side table + candle jar
  metal.addCylinder(-2.22, 0.05, 0.72, 0.18, 0.18, 0.02, 14, PALETTE.bronze);
  metal.addCylinder(-2.22, 0.07, 0.72, 0.022, 0.022, 0.44, 8, PALETTE.bronze);
  metal.addCylinder(-2.22, 0.51, 0.72, 0.24, 0.24, 0.025, 16, PALETTE.bronze);
  stone.addCylinder(-2.22, 0.535, 0.72, 0.055, 0.055, 0.1, 12, PALETTE.whiteCeramic);

  // Monolithic Chamfered Travertine Coffee Table + Tea Service + E-Ink Temp Sensor
  metal.addBox(-4.38, 0.12, 0.08, 1.32, 0.14, 0.74, PALETTE.bronze, { aoBottom: 0.65 });
  stone.addChamferBox(-4.38, 0.29, 0.08, 1.72, 0.2, 0.98, 0.03, PALETTE.travertine, { aoBottom: 0.78 });
  // Walnut tea tray + lathed teapot + 4 teacups + art books
  wood.addBox(-4.72, 0.4, 0.08, 0.56, 0.025, 0.38, PALETTE.walnut);
  stone.addLathe(
    -4.82,
    0.415,
    0.05,
    [
      [0.03, 0],
      [0.075, 0.035],
      [0.078, 0.08],
      [0.042, 0.115],
      [0.048, 0.125],
      [0.015, 0.138],
      [0.0, 0.142],
    ],
    12,
    PALETTE.basaltMid,
  );
  for (const [cx, cz] of [
    [-4.62, -0.02],
    [-4.52, 0.04],
    [-4.62, 0.15],
    [-4.52, 0.19],
  ]) {
    stone.addCylinder(cx, 0.415, cz, 0.022, 0.03, 0.042, 10, PALETTE.whiteCeramic);
  }
  soft.addBox(-4.05, 0.405, 0.22, 0.28, 0.03, 0.22, PALETTE.bookCream);
  soft.addBox(-4.06, 0.435, 0.22, 0.24, 0.025, 0.19, PALETTE.bookSlate);
  // Real physical E-Ink Temp/Humidity Dock (sensor.living_temperature @ [-4.15, 0.58, 0.05])
  stone.addBox(-4.15, 0.435, 0.02, 0.11, 0.09, 0.04, PALETTE.whiteCeramic);
  stone.addBox(-4.15, 0.44, 0.042, 0.085, 0.065, 0.006, PALETTE.oledScreen);

  // Media Credenza + Vapor Fireplace + 77" OLED TV + Soundbar
  wood.addBox(-4.85, 0.4, -3.68, 3.8, 0.44, 0.5, PALETTE.walnut, { aoBottom: 0.72 });
  // Drawer dividers & fireplace hearth recess
  for (const dx of [-6.12, -5.48, -4.22, -3.58]) {
    metal.addBox(dx, 0.4, -3.42, 0.015, 0.4, 0.015, PALETTE.bronze);
  }
  stone.addBox(-4.85, 0.64, -3.66, 1.35, 0.06, 0.24, PALETTE.basalt);
  warmEmit.addBox(-4.85, 0.675, -3.66, 1.15, 0.035, 0.05); // linear vapor fireplace ember glow
  // 77" OLED TV + Soundbar + Subwoofer
  metal.addBox(-4.85, 1.66, -3.9, 1.98, 1.14, 0.035, PALETTE.darkMetal);
  stone.addBox(-4.85, 1.66, -3.88, 1.93, 1.09, 0.015, PALETTE.oledScreen);
  metal.addBox(-4.85, 0.88, -3.78, 1.18, 0.075, 0.09, PALETTE.darkMetal); // soundbar
  metal.addBox(-6.98, 0.26, -3.68, 0.32, 0.4, 0.34, PALETTE.darkMetal, { aoBottom: 0.72 }); // subwoofer

  // Built-in West Wall Bookshelf Niche (X = -8.25, Z: -3.55 .. -1.25)
  wood.addBox(-8.24, 1.56, -2.4, 0.34, 2.7, 2.3, PALETTE.walnutDark, { cullLeft: true, aoBottom: 0.72 });
  for (const sy of [0.35, 0.92, 1.48, 2.04, 2.6]) {
    wood.addBox(-8.22, sy, -2.4, 0.32, 0.04, 2.22, PALETTE.walnut);
  }
  ceilEmit.addBox(-8.12, 2.57, -2.4, 0.03, 0.02, 2.1); // bookshelf indirect cove
  addBookRow(wood, soft, -3.35, 0.94, -8.2, 11, 'z', 1);
  addBookRow(wood, soft, -2.35, 1.5, -8.2, 9, 'z', 4);
  addBookRow(wood, soft, -3.25, 2.06, -8.2, 8, 'z', 7);
  stone.addLathe(
    -8.2,
    1.5,
    -3.1,
    [
      [0.05, 0],
      [0.09, 0.09],
      [0.075, 0.2],
      [0.038, 0.26],
      [0.044, 0.29],
    ],
    12,
    PALETTE.whiteCeramic,
  );

  // Sculptural Indoor Fiddle-Leaf Fig in SW Corner (X = -7.85, Z = +2.15)
  stone.addLathe(
    -7.85,
    0.05,
    2.15,
    [
      [0.16, 0],
      [0.22, 0.18],
      [0.2, 0.42],
      [0.21, 0.44],
      [0.18, 0.44],
    ],
    14,
    PALETTE.terracotta,
  );
  wood.addCylinder(-7.85, 0.4, 2.15, 0.035, 0.022, 1.15, 8, PALETTE.walnutDark);
  foliage.addFoliageCluster(-7.85, 1.62, 2.15, 0.42, 0.36, 0.4, PALETTE.fiddleLeaf, 5, 8);
  foliage.addFoliageCluster(-7.58, 1.38, 2.02, 0.28, 0.24, 0.28, PALETTE.oliveLeaf, 5, 8);
  foliage.addFoliageCluster(-8.04, 1.44, 2.32, 0.26, 0.22, 0.28, PALETTE.fiddleLeaf, 5, 8);

  // Sculptural Arco Floor Lamp (light.living_lamp @ [-6.48, 2.05, -1.9])
  stone.addCylinder(-7.35, 0.05, -2.35, 0.22, 0.21, 0.14, 16, PALETTE.basalt, { noBottomCap: true });
  metal.addTube(
    [
      [-7.35, 0.18, -2.35],
      [-7.34, 1.15, -2.34],
      [-7.22, 1.98, -2.26],
      [-6.9, 2.36, -2.1],
      [-6.56, 2.34, -1.94],
      [-6.48, 2.18, -1.9],
    ],
    0.024,
    8,
    PALETTE.brass,
    { capEnds: true },
  );
  metal.addCylinder(-6.48, 2.14, -1.9, 0.15, 0.06, 0.08, 14, PALETTE.brass);
  lampEmit.addCylinder(-6.48, 1.96, -1.9, 0.22, 0.15, 0.19, 16);
}

// ============================================================================
// 6. ROOM 2: ENTRANCE HALL & ARCHITECTURAL HUB MEDIA BAY
// ============================================================================
function buildEntranceHall() {
  const stone = getBucket('InteriorSurface');
  const wood = getBucket('InteriorWood');
  const soft = getBucket('InteriorSoft');
  const metal = getBucket('InteriorMetal');
  const glass = getBucket('ArchitecturalGlass');
  const foliage = getBucket('Foliage');
  const sapEmit = getBucket('Emit_SapphireAccent');

  // Entry Doormat
  soft.addBox(0.78, 0.058, 2.52, 1.35, 0.015, 0.78, PALETTE.charcoalFabric, { cullBottom: true });

  // West Wall Custom Floor-to-Ceiling Shoe Cabinet + Entry Bench
  wood.addBox(-0.84, 1.66, -1.1, 0.48, 2.86, 1.62, PALETTE.walnut, { cullLeft: true, aoBottom: 0.74 });
  // Open mid-height key/diffuser niche
  stone.addBox(-0.78, 1.24, -1.1, 0.4, 0.42, 0.96, PALETTE.travertine);
  metal.addCylinder(-0.74, 1.04, -1.25, 0.1, 0.12, 0.025, 12, PALETTE.brass); // key tray
  stone.addCylinder(-0.74, 1.04, -0.92, 0.045, 0.04, 0.11, 10, PALETTE.porcelainSoft); // diffuser bottle
  // Upholstered Entry Bench (Z = +0.25)
  wood.addBox(-0.84, 0.23, 0.35, 0.48, 0.36, 1.15, PALETTE.walnutDark, { aoBottom: 0.72 });
  soft.addChamferBox(-0.84, 0.45, 0.35, 0.46, 0.09, 1.12, 0.025, PALETTE.charcoalFabric);

  // Full-Length Bronze Mirror on East Partition Wall (X = 2.48, Z = -1.9)
  metal.addBox(2.49, 1.32, -1.9, 0.03, 1.92, 0.68, PALETTE.brass);
  glass.addGlassPane(
    [2.47, 0.4, -2.2],
    [2.47, 0.4, -1.6],
    [2.47, 2.24, -1.6],
    [2.47, 2.24, -2.2],
    [-1, 0, 0],
  );

  // Home Security Panel (alarm_control_panel.home_alarm @ [2.38, 1.48, 1.55]) mounted on Divider Fin
  metal.addBox(2.47, 1.48, 1.55, 0.04, 0.32, 0.24, PALETTE.darkMetal);
  sapEmit.addBox(2.445, 1.5, 1.55, 0.015, 0.18, 0.16);
  addWallSwitch86(metal, stone, 2.48, 1.12, 1.55, '-x');

  // Ceiling mmWave Presence Sensor (binary_sensor.hall_motion @ [0.78, 2.95, 1.55])
  stone.addCylinder(0.78, 3.09, 1.55, 0.085, 0.078, 0.032, 14, PALETTE.whiteCeramic);
  sapEmit.addCylinder(0.78, 3.08, 1.55, 0.016, 0.016, 0.01, 10);

  // Architectural Smart Hub Media Bay (around HUB_CORE_ANCHOR = [0.65, 1.05, -1.18], clear of stairwell)
  wood.addBox(0.65, 0.64, -1.42, 1.42, 1.18, 0.48, PALETTE.walnut, { aoBottom: 0.7 });
  stone.addBox(0.65, 1.245, -1.42, 1.46, 0.04, 0.52, PALETTE.travertine);
  // Equipment bay inner chassis (Cangze Hub Core + HA Box + 2-Bay NAS)
  stone.addBox(0.65, 0.86, -1.3, 1.26, 0.62, 0.22, PALETTE.basalt);
  metal.addBox(0.65, 0.96, -1.24, 0.4, 0.34, 0.22, PALETTE.darkMetal); // Cangze Hub Core chassis
  sapEmit.addBox(0.65, 1.02, -1.16, 0.26, 0.065, 0.03); // Cangze Sapphire Core Light
  warmEmitBox(0.65, 0.88, -1.16, 0.09, 0.07, 0.025);
  metal.addBox(0.22, 0.72, -1.24, 0.24, 0.1, 0.2, PALETTE.steel); // HA Mini Host
  metal.addBox(1.08, 0.76, -1.24, 0.22, 0.24, 0.22, PALETTE.darkMetal); // Dual-Bay NAS
  sapEmit.addBox(1.08, 0.82, -1.125, 0.14, 0.02, 0.01);
  // Glass front showcase door + tabletop planter
  glass.addGlassPane(
    [0.04, 0.55, -1.15],
    [1.26, 0.55, -1.15],
    [1.26, 1.16, -1.15],
    [0.04, 1.16, -1.15],
    [0, 0, 1],
  );
  stone.addCylinder(0.22, 1.265, -1.42, 0.09, 0.11, 0.14, 12, PALETTE.porcelainSoft);
  foliage.addFoliageCluster(0.22, 1.48, -1.42, 0.16, 0.14, 0.16, PALETTE.fiddleLeaf, 4, 7);
}

function warmEmitBox(x, y, z, sx, sy, sz) {
  getBucket('Emit_WarmAccent').addBox(x, y, z, sx, sy, sz);
}

// ============================================================================
// 7. ROOM 3: KITCHEN, APPLIANCE WALL, ISLAND & WINDOW DINING
// ============================================================================
function buildKitchenDining() {
  const stone = getBucket('InteriorSurface');
  const wood = getBucket('InteriorWood');
  const soft = getBucket('InteriorSoft');
  const metal = getBucket('InteriorMetal');
  const glass = getBucket('ArchitecturalGlass');
  const foliage = getBucket('Foliage');
  const kitEmit = getBucket('Emit_KitchenPendant');
  const sapEmit = getBucket('Emit_SapphireAccent');

  // --- Rear Appliance & Cabinetry Wall (Z = -3.72, X: 2.8 .. 7.4) ---
  // Tall French-Door Refrigerator (X = 3.28)
  metal.addChamferBox(3.28, 1.24, -3.68, 0.9, 2.36, 0.62, 0.02, PALETTE.darkMetal, { aoBottom: 0.74 });
  metal.addBox(3.05, 1.58, -3.36, 0.42, 1.32, 0.025, PALETTE.steel);
  metal.addBox(3.51, 1.58, -3.36, 0.42, 1.32, 0.025, PALETTE.steel);
  metal.addBox(3.05, 0.54, -3.36, 0.42, 0.68, 0.025, PALETTE.steel);
  metal.addBox(3.51, 0.54, -3.36, 0.42, 0.68, 0.025, PALETTE.steel);
  stone.addBox(3.05, 1.55, -3.34, 0.18, 0.34, 0.012, PALETTE.oledScreen); // ice/water niche

  // Tall Built-in Oven + Steam Oven Tower (X = 4.18)
  wood.addBox(4.18, 1.5, -3.7, 0.78, 2.9, 0.6, PALETTE.walnut, { aoBottom: 0.72 });
  stone.addBox(4.18, 0.96, -3.38, 0.62, 0.52, 0.03, PALETTE.oledScreen); // lower oven
  metal.addBox(4.18, 1.14, -3.34, 0.54, 0.028, 0.035, PALETTE.steel);
  stone.addBox(4.18, 1.58, -3.38, 0.62, 0.44, 0.03, PALETTE.oledScreen); // upper steam oven
  metal.addBox(4.18, 1.74, -3.34, 0.54, 0.028, 0.035, PALETTE.steel);

  // Main Prep Counter, Upper Cabinetry, Induction Cooktop & Backsplash (X = 4.62..7.38)
  wood.addBox(6.0, 0.47, -3.7, 2.78, 0.84, 0.6, PALETTE.walnut, { aoBottom: 0.72 });
  stone.addBox(6.0, 0.92, -3.68, 2.8, 0.05, 0.64, PALETTE.travertine);
  stone.addBox(6.0, 1.46, -3.99, 2.78, 1.04, 0.03, PALETTE.travertineWarm); // backsplash
  wood.addBox(6.0, 2.48, -3.78, 2.78, 0.96, 0.44, PALETTE.walnut); // upper wall cabinets
  kitEmit.addBox(6.0, 1.99, -3.72, 2.58, 0.02, 0.04); // under-cabinet task LED

  // 4-Zone Black Glass Induction Hob + Copper Stockpot (X = 5.15)
  stone.addBox(5.15, 0.95, -3.68, 0.78, 0.015, 0.5, PALETTE.oledScreen);
  metal.addCylinder(4.98, 0.96, -3.64, 0.12, 0.12, 0.14, 14, PALETTE.brass);
  metal.addCylinder(4.98, 1.1, -3.64, 0.125, 0.02, 0.035, 14, PALETTE.steel);

  // Backsplash Rail, Wooden Cutting Board, Spice Jars & Detailed Espresso Machine (switch.coffee_machine)
  metal.addBox(5.2, 1.24, -3.96, 1.2, 0.015, 0.02, PALETTE.bronze);
  wood.addBox(5.68, 1.12, -3.92, 0.28, 0.34, 0.025, PALETTE.oak); // cutting board
  for (let i = 0; i < 3; i++) {
    stone.addCylinder(4.72 + i * 0.11, 0.95, -3.88, 0.035, 0.035, 0.11, 10, PALETTE.porcelainSoft);
  }
  // Espresso Machine @ [6.05, 0.95, -3.52]
  metal.addChamferBox(6.05, 1.14, -3.55, 0.36, 0.36, 0.36, 0.02, PALETTE.steel);
  metal.addBox(6.05, 0.97, -3.42, 0.34, 0.035, 0.14, PALETTE.darkMetal); // drip tray
  metal.addBox(6.05, 1.18, -3.35, 0.11, 0.08, 0.08, PALETTE.brass); // grouphead
  metal.addBox(6.14, 1.16, -3.28, 0.16, 0.022, 0.022, PALETTE.walnutDark, { rotY: 0.4 }); // portafilter handle
  stone.addCylinder(6.0, 0.99, -3.41, 0.028, 0.034, 0.05, 10, PALETTE.whiteCeramic);
  stone.addCylinder(6.1, 0.99, -3.41, 0.028, 0.034, 0.05, 10, PALETTE.whiteCeramic);

  // Smart Load Meter Cabinet on East Kitchen Wall (sensor.home_power_kw @ [7.28, 1.55, -2.1])
  metal.addBox(7.42, 1.55, -2.1, 0.06, 0.48, 0.36, PALETTE.darkMetal);
  glass.addGlassPane(
    [7.38, 1.35, -2.25],
    [7.38, 1.35, -1.95],
    [7.38, 1.75, -1.95],
    [7.38, 1.75, -2.25],
    [-1, 0, 0],
  );
  sapEmit.addBox(7.39, 1.62, -2.1, 0.015, 0.08, 0.18);

  // --- Waterfall Travertine Kitchen Island (X = 5.1, Z = -0.45) ---
  stone.addBox(5.1, 0.48, -0.45, 3.1, 0.9, 1.12, PALETTE.travertine, { aoBottom: 0.74 });
  wood.addBox(5.1, 0.45, 0.09, 2.86, 0.82, 0.06, PALETTE.walnut, { aoBottom: 0.72 });
  // Undermount Sink Basin + Gooseneck Brass Faucet (X = 4.35, Z = -0.52)
  metal.addBox(4.35, 0.92, -0.52, 0.68, 0.04, 0.44, PALETTE.steel);
  metal.addTube(
    [
      [4.35, 0.94, -0.78],
      [4.35, 1.18, -0.78],
      [4.35, 1.29, -0.7],
      [4.35, 1.28, -0.58],
      [4.35, 1.17, -0.54],
    ],
    0.018,
    8,
    PALETTE.brass,
    { capEnds: true },
  );
  // Ceramic Pedestal Fruit Bowl + Wine Glasses on Island
  stone.addLathe(
    5.65,
    0.935,
    -0.45,
    [
      [0.06, 0],
      [0.04, 0.03],
      [0.18, 0.075],
      [0.17, 0.09],
      [0.02, 0.045],
    ],
    14,
    PALETTE.porcelainSoft,
  );
  foliage.addFoliageCluster(5.62, 1.02, -0.44, 0.045, 0.045, 0.045, PALETTE.oliveLeafLight, 4, 6);
  foliage.addFoliageCluster(5.7, 1.03, -0.48, 0.045, 0.042, 0.045, PALETTE.terracotta, 4, 6);

  // 3 Sculpted Low-Back Bar Stools along Island
  for (const sx of [4.1, 5.1, 6.1]) {
    for (const [dx, dz] of [
      [-0.16, -0.15],
      [0.16, -0.15],
      [-0.16, 0.15],
      [0.16, 0.15],
    ]) {
      metal.addCylinder(sx + dx, 0.05, 0.56 + dz, 0.015, 0.012, 0.62, 6, PALETTE.bronze);
    }
    metal.addBox(sx, 0.25, 0.56, 0.34, 0.02, 0.32, PALETTE.bronze); // footring bar
    soft.addChamferBox(sx, 0.69, 0.56, 0.42, 0.065, 0.4, 0.02, PALETTE.charcoalFabric);
    wood.addChamferBox(sx, 0.81, 0.74, 0.42, 0.16, 0.055, 0.018, PALETTE.walnut);
  }

  // Linear Brass Island Pendant (light.kitchen_pendant @ [5.1, 2.32, -0.25])
  metal.addCylinder(4.25, 2.4, -0.25, 0.01, 0.01, 0.74, 6, PALETTE.brass);
  metal.addCylinder(5.95, 2.4, -0.25, 0.01, 0.01, 0.74, 6, PALETTE.brass);
  metal.addBox(5.1, 2.38, -0.25, 2.24, 0.055, 0.085, PALETTE.brass);
  kitEmit.addBox(5.1, 2.33, -0.25, 2.12, 0.03, 0.06);

  // 4-Seat Dining Table & Curved Oak Chairs near Kitchen South Window (X = 4.55, Z = +1.78)
  wood.addChamferBox(4.55, 0.74, 1.78, 1.68, 0.05, 0.92, 0.015, PALETTE.walnut);
  for (const lx of [3.9, 5.2]) {
    for (const lz of [1.44, 2.12]) {
      wood.addCylinder(lx, 0.05, lz, 0.03, 0.024, 0.67, 8, PALETTE.walnutDark);
    }
  }
  for (const [cx, cz, ry] of [
    [4.18, 1.24, 0],
    [4.92, 1.24, 0],
    [4.18, 2.32, Math.PI],
    [4.92, 2.32, Math.PI],
  ]) {
    for (const [dx, dz] of [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17],
    ]) {
      const [px, , pz] = rotateY(cx + dx, 0, cz + dz, cx, cz, ry);
      wood.addCylinder(px, 0.05, pz, 0.016, 0.013, 0.42, 6, PALETTE.oak);
    }
    soft.addChamferBox(cx, 0.47, cz, 0.42, 0.055, 0.42, 0.018, PALETTE.linenWarm, { rotY: ry });
    wood.addChamferBox(cx, 0.68, cz - Math.cos(ry) * 0.19, 0.42, 0.24, 0.045, 0.015, PALETTE.oak, {
      rotY: ry,
    });
  }
  // Tableware + Centerpiece Vase
  for (const px of [4.18, 4.92]) {
    for (const pz of [1.54, 2.02]) {
      stone.addCylinder(px, 0.765, pz, 0.12, 0.13, 0.016, 12, PALETTE.whiteCeramic);
    }
  }
  stone.addLathe(
    4.55,
    0.765,
    1.78,
    [
      [0.04, 0],
      [0.075, 0.08],
      [0.055, 0.18],
      [0.028, 0.23],
    ],
    12,
    PALETTE.porcelainSoft,
  );
  foliage.addFoliageCluster(4.55, 1.08, 1.78, 0.14, 0.12, 0.14, PALETTE.oliveLeafLight, 4, 6);
}

// ============================================================================
// 8. ROOM 4: UPPER MASTER SUITE, STUDY CORNER, WALK-IN WARDROBE, SPA BATH & TERRACE
// ============================================================================
function buildMasterSuite() {
  const stone = getBucket('InteriorSurface');
  const wood = getBucket('InteriorWood');
  const soft = getBucket('InteriorSoft');
  const metal = getBucket('InteriorMetal');
  const glass = getBucket('ArchitecturalGlass');
  const foliage = getBucket('Foliage');
  const bedEmit = getBucket('Emit_BedroomLight');
  const sapEmit = getBucket('Emit_SapphireAccent');

  // --- Central Sleep Sanctuary (X = -3.4, Z = -2.05) ---
  soft.addBox(-3.4, 3.452, -1.65, 4.35, 0.014, 3.65, PALETTE.linenWarm, { cullBottom: true });
  // Recessed plinth (leaves clearance for under-bed nightCoveStrip) + Floating Platform
  wood.addBox(-3.4, 3.5, -2.02, 2.5, 0.1, 2.1, PALETTE.walnutDark, { aoBottom: 0.65 });
  wood.addBox(-3.4, 3.61, -2.05, 3.04, 0.12, 2.58, PALETTE.walnut, { aoBottom: 0.74 });
  // Tufted Upholstered Headboard + Twin Framed Artworks above
  soft.addChamferBox(-3.4, 4.24, -3.28, 3.16, 1.14, 0.22, 0.04, PALETTE.linenWarm, { aoBottom: 0.78 });
  for (const ax of [-4.15, -2.65]) {
    metal.addBox(ax, 5.26, -3.89, 0.72, 0.88, 0.03, PALETTE.bronze);
    soft.addBox(ax, 5.26, -3.87, 0.64, 0.8, 0.018, PALETTE.linen);
  }
  // Mattress + Duvet + Throw + 4 Plump Pillows
  soft.addChamferBox(-3.4, 3.81, -1.98, 2.66, 0.24, 2.26, 0.06, PALETTE.linen, { aoBottom: 0.82 });
  soft.addChamferBox(-3.4, 3.9, -1.78, 2.74, 0.16, 1.88, 0.06, PALETTE.whiteCeramic, { aoBottom: 0.85 });
  soft.addChamferBox(-3.4, 3.99, -1.24, 2.76, 0.055, 0.66, 0.025, PALETTE.charcoalFabric);
  for (const px of [-3.98, -2.82]) {
    soft.addChamferBox(px, 4.04, -2.88, 0.8, 0.17, 0.44, 0.055, PALETTE.whiteCeramic);
    soft.addChamferBox(px, 4.08, -2.62, 0.56, 0.15, 0.24, 0.045, PALETTE.sageFabric);
  }
  // Upholstered Bed-End Bench
  wood.addBox(-3.4, 3.58, -0.38, 1.92, 0.24, 0.46, PALETTE.walnutDark, { aoBottom: 0.7 });
  soft.addChamferBox(-3.4, 3.74, -0.38, 1.96, 0.12, 0.48, 0.035, PALETTE.charcoalFabric);

  // Twin Nightstands + Books + Carafe + Suspended Bedside Globe Pendants (light.bedroom_light)
  for (const nx of [-5.25, -1.55]) {
    wood.addBox(nx, 3.68, -3.05, 0.64, 0.36, 0.52, PALETTE.walnut, { aoBottom: 0.74 });
    metal.addCylinder(nx, 4.46, -3.05, 0.008, 0.008, 1.88, 6, PALETTE.brass); // suspension stem
    bedEmit.addFoliageCluster(nx, 4.34, -3.05, 0.13, 0.13, 0.13, '#ffffff', 6, 10);
  }
  soft.addBox(-5.28, 3.88, -3.02, 0.22, 0.04, 0.16, PALETTE.bookCream);
  stone.addCylinder(-1.58, 3.86, -3.02, 0.045, 0.035, 0.14, 10, PALETTE.porcelainSoft);

  // Master Suite Whisper Climate Unit (climate.bedroom_ac @ [-3.4, 5.88, -3.72])
  metal.addChamferBox(-3.4, 5.98, -3.82, 1.65, 0.22, 0.24, 0.03, PALETTE.bronze);
  addWallSwitch86(metal, stone, -1.1, 4.65, -3.88, '+z');

  // --- West Cantilever Study Nook (X: -7.45 .. -5.8, Z: -2.2 .. +1.2) ---
  wood.addChamferBox(-6.96, 4.18, -0.95, 0.72, 0.055, 1.72, 0.015, PALETTE.walnut);
  wood.addBox(-6.96, 3.8, -1.68, 0.64, 0.7, 0.06, PALETTE.walnutDark, { aoBottom: 0.72 });
  wood.addBox(-6.96, 3.8, -0.22, 0.64, 0.7, 0.06, PALETTE.walnutDark, { aoBottom: 0.72 });
  // Ultrawide Curved Monitor + Laptop + Brass Desk Lamp
  metal.addBox(-7.14, 4.36, -0.95, 0.14, 0.3, 0.18, PALETTE.steel);
  stone.addBox(-7.1, 4.52, -0.95, 0.03, 0.38, 0.84, PALETTE.oledScreen);
  sapEmit.addBox(-7.08, 4.52, -0.95, 0.008, 0.28, 0.64);
  metal.addBox(-6.94, 4.22, -1.48, 0.24, 0.015, 0.34, PALETTE.steel); // laptop base
  metal.addBox(-7.05, 4.32, -1.48, 0.015, 0.22, 0.34, PALETTE.darkMetal); // laptop lid
  // Brass reading lamp on desk (linked to Emit_BedroomLight)
  metal.addCylinder(-7.06, 4.21, -0.35, 0.08, 0.075, 0.02, 12, PALETTE.brass);
  metal.addCylinder(-7.06, 4.23, -0.35, 0.012, 0.012, 0.36, 8, PALETTE.brass);
  bedEmit.addCylinder(-6.98, 4.55, -0.35, 0.09, 0.05, 0.09, 12);
  // Ergonomic Swivel Chair
  metal.addCylinder(-6.22, 3.45, -0.95, 0.24, 0.04, 0.05, 10, PALETTE.darkMetal);
  metal.addCylinder(-6.22, 3.5, -0.95, 0.028, 0.028, 0.38, 8, PALETTE.darkMetal);
  soft.addChamferBox(-6.22, 3.91, -0.95, 0.48, 0.08, 0.48, 0.025, PALETTE.charcoalFabric);
  soft.addChamferBox(-6.0, 4.24, -0.95, 0.08, 0.56, 0.44, 0.025, PALETTE.charcoalFabric);
  // Study Wall Floating Bookshelf + SW Potted Plant
  wood.addBox(-7.42, 4.95, -2.55, 0.28, 0.04, 1.35, PALETTE.walnut);
  addBookRow(wood, soft, -3.1, 4.97, -7.4, 9, 'z', 3);
  stone.addCylinder(-7.18, 3.45, 1.85, 0.16, 0.19, 0.38, 12, PALETTE.porcelainSoft, { noBottomCap: true });
  foliage.addFoliageCluster(-7.18, 4.18, 1.85, 0.34, 0.32, 0.34, PALETTE.fiddleLeaf, 5, 8);

  // --- East Walk-In Wardrobe & Semi-Open Spa Bath (X: -0.35 .. +2.65, Z: -2.20 .. +2.00) ---
  // Walk-In Wardrobe backing stair corridor (Z = -2.02, X: -0.25..+1.35)
  wood.addBox(0.55, 4.86, -2.02, 1.62, 2.76, 0.56, PALETTE.walnutDark, { aoBottom: 0.72 });
  glass.addGlassPane(
    [-0.24, 3.52, -1.73],
    [1.34, 3.52, -1.73],
    [1.34, 6.18, -1.73],
    [-0.24, 6.18, -1.73],
    [0, 0, 1],
  );
  metal.addBox(0.55, 4.86, -1.72, 0.04, 2.66, 0.02, PALETTE.bronze); // center mullion

  // Floating Travertine Vanity + Vessel Basin + Round Mirror (against East Wardrobe return, X = 2.05, Z = -1.45)
  stone.addBox(2.05, 4.18, -1.35, 0.92, 0.18, 0.52, PALETTE.travertine);
  stone.addCylinder(2.05, 4.27, -1.35, 0.16, 0.2, 0.11, 14, PALETTE.whiteCeramic);
  metal.addTube(
    [
      [2.05, 4.27, -1.56],
      [2.05, 4.44, -1.56],
      [2.05, 4.48, -1.46],
    ],
    0.014,
    8,
    PALETTE.brass,
    { capEnds: true },
  );
  metal.addBox(2.05, 5.1, -1.62, 0.62, 0.62, 0.025, PALETTE.brass); // framed square/octagonal vanity mirror

  // Sculptural Elliptical Freestanding Soaking Tub + Bath Filler + Caddy (X = 1.75, Z = +1.05)
  stone.addLathe(
    1.75,
    3.45,
    1.05,
    [
      [0.34, 0],
      [0.44, 0.16],
      [0.48, 0.44],
      [0.49, 0.56],
      [0.44, 0.56],
      [0.42, 0.42],
      [0.36, 0.14],
      [0.0, 0.1],
    ],
    20,
    PALETTE.whiteCeramic,
    { scaleX: 1.0, scaleZ: 1.65 },
  );
  wood.addBox(1.75, 4.02, 1.05, 0.96, 0.025, 0.22, PALETTE.oak); // bath caddy tray
  metal.addTube(
    [
      [2.32, 3.45, 1.05],
      [2.32, 4.28, 1.05],
      [2.24, 4.35, 1.05],
      [2.16, 4.28, 1.05],
    ],
    0.018,
    8,
    PALETTE.brass,
    { capEnds: true },
  );

  // --- Upper East Rooftop Terrace Loungers & Planters ---
  for (const lx of [4.6, 6.0]) {
    wood.addBox(lx, 3.58, 0.55, 0.84, 0.18, 1.56, PALETTE.walnut, { aoBottom: 0.72 });
    soft.addChamferBox(lx, 3.72, 0.72, 0.76, 0.11, 1.18, 0.03, PALETTE.linen);
    soft.addChamferBox(lx, 3.86, 0.02, 0.76, 0.11, 0.46, 0.03, PALETTE.linen);
  }
  stone.addCylinder(5.3, 3.45, 0.65, 0.24, 0.26, 0.36, 12, PALETTE.basaltMid);
  stone.addBox(5.2, 3.68, -3.28, 3.9, 0.44, 0.52, PALETTE.basalt, { aoBottom: 0.72 });
  foliage.addFoliageCluster(4.1, 4.08, -3.28, 0.65, 0.34, 0.3, PALETTE.shrubLeaf, 5, 7);
  foliage.addFoliageCluster(5.8, 4.12, -3.28, 0.75, 0.38, 0.32, PALETTE.oliveLeafLight, 5, 7);
}

// ============================================================================
// 9. ROOM 5: COURTYARD LOUNGE, FASTBACK EV COUPE & WALLBOX CHARGER
// ============================================================================
function buildGarageAndCourtyard() {
  const stone = getBucket('InteriorSurface');
  const wood = getBucket('InteriorWood');
  const soft = getBucket('InteriorSoft');
  const metal = getBucket('InteriorMetal');
  const glass = getBucket('ArchitecturalGlass');
  const sapEmit = getBucket('Emit_SapphireAccent');
  const warmEmit = getBucket('Emit_WarmAccent');

  // --- Sleek Fastback EV Coupe in Garage (X = 9.5, Z = -1.15) ---
  // Main fastback extruded body profile in (Z, Y) plane
  stone.addExtrudedYZ(
    9.5,
    1.76,
    [
      [-3.05, 0.28],
      [-2.95, 0.68],
      [-2.1, 0.88],
      [-1.15, 1.34],
      [-0.15, 1.38],
      [0.55, 1.02],
      [1.08, 0.86],
      [1.12, 0.48],
      [1.04, 0.26],
      [-2.92, 0.24],
    ],
    PALETTE.evBody,
  );
  // Hood & side crease sculpted trim + side mirrors
  stone.addChamferBox(9.5, 0.66, 0.22, 1.72, 0.36, 1.68, 0.08, PALETTE.evBody);
  metal.addBox(8.56, 0.94, -0.35, 0.16, 0.07, 0.11, PALETTE.evBody); // left mirror
  metal.addBox(10.44, 0.94, -0.35, 0.16, 0.07, 0.11, PALETTE.evBody); // right mirror
  // Dark Tinted Panoramic Glass Canopy & Windshield
  glass.addGlassPane(
    [8.74, 0.96, 0.42],
    [10.26, 0.96, 0.42],
    [10.18, 1.34, -0.15],
    [8.82, 1.34, -0.15],
    [0, 0.68, 0.73],
  );
  glass.addGlassPane(
    [8.82, 1.35, -0.18],
    [10.18, 1.35, -0.18],
    [10.12, 1.24, -1.78],
    [8.88, 1.24, -1.78],
    [0, 0.99, -0.07],
  );
  // 4 Wheels (Dark Tires + Alloy Rims)
  for (const wx of [8.64, 10.36]) {
    for (const wz of [-2.28, 0.24]) {
      stone.addWheel(wx, 0.33, wz, 0.31, 0.22, 16, PALETTE.evRubber);
      metal.addWheel(wx + (wx < 9.5 ? -0.025 : 0.025), 0.33, wz, 0.2, 0.19, 12, PALETTE.steel);
    }
  }
  // Full-width EV Front Daytime Running Light & Ruby Tail Light Bar
  warmEmit.addBox(9.5, 0.66, 1.09, 1.56, 0.045, 0.03);
  stone.addBox(9.5, 0.72, -3.02, 1.54, 0.05, 0.03, PALETTE.evTaillight);

  // Garage Wallbox EV Charger + Coiled Cable (East Wall X = 11.15, Z = -0.35)
  metal.addBox(11.15, 1.38, -0.35, 0.12, 0.36, 0.24, PALETTE.darkMetal);
  sapEmit.addBox(11.08, 1.44, -0.35, 0.015, 0.12, 0.04);
  stone.addTube(
    [
      [11.12, 1.2, -0.35],
      [11.05, 0.92, -0.22],
      [10.95, 0.85, -0.05],
      [11.05, 1.02, -0.1],
    ],
    0.018,
    6,
    PALETTE.evRubber,
    { capEnds: true },
  );
  // Garage Rear Tool Storage Rack
  metal.addBox(9.5, 0.92, -3.78, 2.4, 1.72, 0.44, PALETTE.darkMetal, { aoBottom: 0.7 });

  // --- East Courtyard Outdoor Lounge (X = 5.4, Z = 5.1; leaves X > 7.8 driveway clear) ---
  for (const [cx, cz, ry] of [
    [4.85, 5.25, 0.35],
    [6.35, 5.15, -0.45],
  ]) {
    wood.addBox(cx, 0.26, cz, 0.78, 0.32, 0.76, PALETTE.cedar, { rotY: ry, aoBottom: 0.72 });
    soft.addChamferBox(cx, 0.46, cz, 0.72, 0.12, 0.7, 0.03, PALETTE.linenWarm, { rotY: ry });
    soft.addChamferBox(
      cx - Math.sin(ry) * 0.26,
      0.66,
      cz - Math.cos(ry) * 0.26,
      0.7,
      0.34,
      0.14,
      0.03,
      PALETTE.linenWarm,
      { rotY: ry },
    );
  }
  stone.addCylinder(5.6, 0.02, 5.45, 0.34, 0.36, 0.32, 14, PALETTE.basaltMid, { noBottomCap: true });
}

// ============================================================================
// 10. BUILD & SERIALIZE TO BINARY glTF 2.0 (.glb)
// ============================================================================
function buildGlb() {
  buildSite();
  buildGroundStructure();
  buildUpperStructure();
  buildStaircaseClean();
  buildLivingRoom();
  buildEntranceHall();
  buildKitchenDining();
  buildMasterSuite();
  buildGarageAndCourtyard();

  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const binParts = [];
  let byteOffset = 0;

  function appendBuffer(typedArray, target) {
    const u8 = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (u8.byteLength % 4)) % 4;
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: u8.byteLength,
      target,
    });
    binParts.push(u8);
    if (pad > 0) binParts.push(new Uint8Array(pad));
    byteOffset += u8.byteLength + pad;
    return viewIndex;
  }

  for (const b of buckets.values()) {
    if (b.indices.length === 0) continue;

    const posArr = new Float32Array(b.positions);
    const normArr = new Float32Array(b.normals);
    const uvArr = new Float32Array(b.uvs);
    const vertexCount = posArr.length / 3;
    const useUint16 = vertexCount < 65536;
    const idxArr = useUint16 ? new Uint16Array(b.indices) : new Uint32Array(b.indices);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < posArr.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (posArr[i + k] < min[k]) min[k] = posArr[i + k];
        if (posArr[i + k] > max[k]) max[k] = posArr[i + k];
      }
    }

    const posView = appendBuffer(posArr, 34962);
    const normView = appendBuffer(normArr, 34962);
    const uvView = appendBuffer(uvArr, 34962);
    const colView = b.vertexColored ? appendBuffer(new Uint16Array(b.colors), 34962) : null;
    const idxView = appendBuffer(idxArr, 34963);

    const posAcc = accessors.length;
    accessors.push({ bufferView: posView, componentType: 5126, count: vertexCount, type: 'VEC3', min, max });

    const normAcc = accessors.length;
    accessors.push({ bufferView: normView, componentType: 5126, count: vertexCount, type: 'VEC3' });

    const uvAcc = accessors.length;
    accessors.push({ bufferView: uvView, componentType: 5126, count: vertexCount, type: 'VEC2' });

    let colAcc = null;
    if (colView !== null) {
      colAcc = accessors.length;
      accessors.push({
        bufferView: colView,
        componentType: 5123,
        normalized: true,
        count: vertexCount,
        type: 'VEC4',
      });
    }

    const idxAcc = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: useUint16 ? 5123 : 5125,
      count: idxArr.length,
      type: 'SCALAR',
    });

    const attributes = {
      POSITION: posAcc,
      NORMAL: normAcc,
      TEXCOORD_0: uvAcc,
      ...(colAcc !== null ? { COLOR_0: colAcc } : {}),
    };

    const meshIndex = meshes.length;
    meshes.push({
      name: b.name,
      primitives: [{ attributes, indices: idxAcc, material: b.materialIndex }],
    });
    nodes.push({ name: b.name, mesh: meshIndex });
  }

  const rootNodeIndex = nodes.length;
  nodes.push({ name: 'CangzeResidenceRoot', children: nodes.map((_, idx) => idx) });

  const gltf = {
    asset: { version: '2.0', generator: 'Cangze Parametric Architectural Builder v2.0' },
    scene: 0,
    scenes: [{ name: 'CangzeSanctuaryResidence', nodes: [rootNodeIndex] }],
    nodes,
    meshes,
    materials: MATERIALS.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
      ...(m.emissiveFactor ? { emissiveFactor: m.emissiveFactor } : {}),
      ...(m.alphaMode ? { alphaMode: m.alphaMode } : {}),
      ...(m.doubleSided ? { doubleSided: true } : {}),
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const binBuffer = Buffer.concat(binParts.map((u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)));

  const totalLength = 12 + 8 + jsonPadded.byteLength + 8 + binBuffer.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4);

  const triangleCount = [...buckets.values()].reduce((acc, b) => acc + b.indices.length / 3, 0);
  const vertexCount = [...buckets.values()].reduce((acc, b) => acc + b.positions.length / 3, 0);

  return {
    glb: Buffer.concat([header, jsonChunkHeader, jsonPadded, binChunkHeader, binBuffer]),
    meshCount: meshes.length,
    vertexCount,
    triangleCount,
  };
}

mkdirSync(dirname(outPath), { recursive: true });
const { glb, meshCount, vertexCount, triangleCount } = buildGlb();
writeFileSync(outPath, glb);
process.stdout.write(
  `Generated ${outPath} (${(glb.byteLength / 1024).toFixed(1)} KB, ${meshCount} mesh groups, ${vertexCount} vertices, ${triangleCount} triangles)\n`,
);
