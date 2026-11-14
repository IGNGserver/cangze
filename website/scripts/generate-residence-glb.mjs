import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parametric Architectural glTF 2.0 (.glb) Builder for Cangze (藏泽) Official Website.
 * Constructs "泽居 · The Sanctuary Pavilion": a two-story modernist smart residence
 * featuring travertine stone, oiled walnut timber, basalt plinths, brushed bronze mullions,
 * low-iron architectural glass, bespoke interior furnishings, courtyard reflecting pool,
 * and Cangze's signature sweeping roof-ridge canopy.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'public', 'models', 'cangze-residence.glb');

const MATERIALS = [
  {
    name: 'TravertineStone',
    baseColorFactor: [0.85, 0.81, 0.74, 1.0],
    metallicFactor: 0.04,
    roughnessFactor: 0.78,
  },
  {
    name: 'BasaltStone',
    baseColorFactor: [0.16, 0.18, 0.21, 1.0],
    metallicFactor: 0.08,
    roughnessFactor: 0.72,
  },
  {
    name: 'OiledWalnut',
    baseColorFactor: [0.42, 0.27, 0.17, 1.0],
    metallicFactor: 0.05,
    roughnessFactor: 0.52,
  },
  {
    name: 'WarmCedar',
    baseColorFactor: [0.58, 0.39, 0.24, 1.0],
    metallicFactor: 0.04,
    roughnessFactor: 0.58,
  },
  {
    name: 'BrushedBronze',
    baseColorFactor: [0.26, 0.22, 0.19, 1.0],
    metallicFactor: 0.86,
    roughnessFactor: 0.32,
  },
  {
    name: 'ArchitecturalGlass',
    baseColorFactor: [0.72, 0.86, 0.96, 0.24],
    metallicFactor: 0.1,
    roughnessFactor: 0.06,
    alphaMode: 'BLEND',
    doubleSided: true,
  },
  {
    name: 'BoucleLinen',
    baseColorFactor: [0.89, 0.86, 0.81, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.9,
  },
  {
    name: 'CharcoalFabric',
    baseColorFactor: [0.24, 0.26, 0.3, 1.0],
    metallicFactor: 0.02,
    roughnessFactor: 0.85,
  },
  {
    name: 'WarmPlaster',
    baseColorFactor: [0.92, 0.9, 0.86, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.84,
  },
  {
    name: 'FoliageCanopy',
    baseColorFactor: [0.23, 0.34, 0.25, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.86,
  },
  {
    name: 'HearthEmissive',
    baseColorFactor: [1.0, 0.78, 0.44, 1.0],
    emissiveFactor: [1.0, 0.64, 0.24],
    metallicFactor: 0.0,
    roughnessFactor: 0.25,
  },
  {
    name: 'HubSapphire',
    baseColorFactor: [0.28, 0.62, 0.96, 1.0],
    emissiveFactor: [0.16, 0.44, 0.85],
    metallicFactor: 0.35,
    roughnessFactor: 0.18,
  },
];

const MAT = Object.fromEntries(MATERIALS.map((m, idx) => [m.name, idx]));

class MeshBucket {
  constructor(name, materialIndex) {
    this.name = name;
    this.materialIndex = materialIndex;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  addQuad(p0, p1, p2, p3, normal, uvScaleU = 1, uvScaleV = 1) {
    const base = this.positions.length / 3;
    this.positions.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) {
      this.normals.push(...normal);
    }
    this.uvs.push(0, 0, uvScaleU, 0, uvScaleU, uvScaleV, 0, uvScaleV);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addTriangle(p0, p1, p2, normal) {
    const base = this.positions.length / 3;
    this.positions.push(...p0, ...p1, ...p2);
    for (let i = 0; i < 3; i++) {
      this.normals.push(...normal);
    }
    this.uvs.push(0, 0, 1, 0, 0.5, 1);
    this.indices.push(base, base + 1, base + 2);
  }

  addBox(cx, cy, cz, sx, sy, sz) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const x0 = cx - hx;
    const x1 = cx + hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const z0 = cz - hz;
    const z1 = cz + hz;

    // +Z front
    this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sx * 0.5, sy * 0.5);
    // -Z back
    this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sx * 0.5, sy * 0.5);
    // +X right
    this.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sz * 0.5, sy * 0.5);
    // -X left
    this.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sz * 0.5, sy * 0.5);
    // +Y top
    this.addQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], sx * 0.5, sz * 0.5);
    // -Y bottom
    this.addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], sx * 0.5, sz * 0.5);
  }

  addCylinder(cx, yBottom, cz, radiusBottom, radiusTop, height, segments = 16) {
    const yTop = yBottom + height;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);

      const p0 = [cx + c0 * radiusBottom, yBottom, cz + s0 * radiusBottom];
      const p1 = [cx + c1 * radiusBottom, yBottom, cz + s1 * radiusBottom];
      const p2 = [cx + c1 * radiusTop, yTop, cz + s1 * radiusTop];
      const p3 = [cx + c0 * radiusTop, yTop, cz + s0 * radiusTop];
      const nx = (c0 + c1) * 0.5;
      const nz = (s0 + s1) * 0.5;
      const len = Math.hypot(nx, nz) || 1;
      this.addQuad(p0, p1, p2, p3, [nx / len, 0, nz / len], 0.25, height * 0.5);

      if (radiusTop > 0.001) {
        this.addTriangle(
          [cx, yTop, cz],
          [cx + c1 * radiusTop, yTop, cz + s1 * radiusTop],
          [cx + c0 * radiusTop, yTop, cz + s0 * radiusTop],
          [0, 1, 0],
        );
      }
      if (radiusBottom > 0.001) {
        this.addTriangle(
          [cx, yBottom, cz],
          [cx + c0 * radiusBottom, yBottom, cz + s0 * radiusBottom],
          [cx + c1 * radiusBottom, yBottom, cz + s1 * radiusBottom],
          [0, -1, 0],
        );
      }
    }
  }

  addSmoothTriangle(p0, p1, p2, n0, n1, n2) {
    const base = this.positions.length / 3;
    this.positions.push(...p0, ...p1, ...p2);
    this.normals.push(...n0, ...n1, ...n2);
    this.uvs.push(0, 0, 1, 0, 0.5, 1);
    this.indices.push(base, base + 1, base + 2);
  }

  addSphere(cx, cy, cz, rx, ry, rz, latSegs = 12, lonSegs = 18) {
    const vert = (t, p) => [
      cx + Math.sin(t) * Math.cos(p) * rx,
      cy + Math.cos(t) * ry,
      cz + Math.sin(t) * Math.sin(p) * rz,
    ];
    const norm = (t, p) => {
      const nx = (Math.sin(t) * Math.cos(p)) / (rx || 1);
      const ny = Math.cos(t) / (ry || 1);
      const nz = (Math.sin(t) * Math.sin(p)) / (rz || 1);
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    for (let lat = 0; lat < latSegs; lat++) {
      const t0 = (lat / latSegs) * Math.PI;
      const t1 = ((lat + 1) / latSegs) * Math.PI;
      for (let lon = 0; lon < lonSegs; lon++) {
        const p0 = (lon / lonSegs) * Math.PI * 2;
        const p1 = ((lon + 1) / lonSegs) * Math.PI * 2;

        const a = vert(t0, p0);
        const b = vert(t1, p0);
        const c = vert(t1, p1);
        const d = vert(t0, p1);
        const na = norm(t0, p0);
        const nb = norm(t1, p0);
        const nc = norm(t1, p1);
        const nd = norm(t0, p1);
        if (lat === 0) {
          this.addSmoothTriangle(a, b, c, na, nb, nc);
        } else if (lat === latSegs - 1) {
          this.addSmoothTriangle(a, b, d, na, nb, nd);
        } else {
          this.addSmoothTriangle(a, b, c, na, nb, nc);
          this.addSmoothTriangle(a, c, d, na, nc, nd);
        }
      }
    }
  }

  /** Sloped prism / roof-ridge wing from (x0, y0) to (x1, y1) with thickness t and depth z0..z1 */
  addSlopedSlab(x0, y0, x1, y1, z0, z1, thickness) {
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

    // Top sloped face
    this.addQuad(t0f, t1f, t1k, t0k, [ux, uy, 0], len * 0.4, (z1 - z0) * 0.4);
    // Bottom soffit face
    this.addQuad(b1f, b0f, b0k, b1k, [-ux, -uy, 0], len * 0.4, (z1 - z0) * 0.4);
    // Front fascia (+Z)
    this.addQuad(b0f, b1f, t1f, t0f, [0, 0, 1], len * 0.4, thickness);
    // Back fascia (-Z)
    this.addQuad(b1k, b0k, t0k, t1k, [0, 0, -1], len * 0.4, thickness);
    // Left cap
    this.addQuad(b0k, b0f, t0f, t0k, [-dx / len, -dy / len, 0], (z1 - z0) * 0.4, thickness);
    // Right cap
    this.addQuad(b1f, b1k, t1k, t1f, [dx / len, dy / len, 0], (z1 - z0) * 0.4, thickness);
  }
}

const buckets = new Map();
function bucket(groupName, matName) {
  const key = `${groupName}__${matName}`;
  if (!buckets.has(key)) {
    buckets.set(key, new MeshBucket(key, MAT[matName]));
  }
  return buckets.get(key);
}

// ============================================================================
// 1. SITE PLINTH, TERRACE & SUNKEN REFLECTING WATER POOL ("泽")
// ============================================================================
{
  const basalt = bucket('SitePlinth', 'BasaltStone');
  const trav = bucket('SiteTerrace', 'TravertineStone');

  // Outer stepped dark basalt foundation plinth
  basalt.addBox(0.5, -0.34, 0.6, 24.4, 0.36, 16.4);
  basalt.addBox(0.5, -0.12, -0.8, 22.6, 0.16, 12.6);

  // Pool basin floor & dark basalt coping around reflecting pool (X: -10.2..+3.2, Z: +3.5..+7.3)
  basalt.addBox(-3.5, -0.2, 5.4, 13.8, 0.08, 4.0);
  basalt.addBox(-3.5, -0.05, 7.35, 14.0, 0.24, 0.28);
  basalt.addBox(-10.35, -0.05, 5.4, 0.28, 0.24, 4.1);
  basalt.addBox(3.35, -0.05, 5.4, 0.28, 0.24, 4.1);

  // Main Travertine Terrace Deck under house + East Courtyard
  trav.addBox(-0.4, -0.04, -0.4, 17.6, 0.12, 7.8);
  trav.addBox(7.6, -0.04, 4.9, 8.2, 0.12, 4.6);

  // Floating Travertine Stepping Stones across the reflecting water to Entrance Hall
  for (let i = 0; i < 4; i++) {
    const z = 7.0 - i * 1.05;
    trav.addBox(0.75 + (i % 2) * 0.14, 0.01, z, 1.35, 0.09, 0.74);
  }
}

// ============================================================================
// 2. GROUND FLOOR ARCHITECTURAL STRUCTURE & WALLS (Y = 0 .. 3.25)
// ============================================================================
{
  const trav = bucket('GroundWalls', 'TravertineStone');
  const walnut = bucket('GroundTimber', 'OiledWalnut');
  const cedar = bucket('GroundLouvers', 'WarmCedar');
  const bronze = bucket('GroundMullions', 'BrushedBronze');
  const glass = bucket('GroundGlass', 'ArchitecturalGlass');
  const plaster = bucket('InteriorPartitions', 'WarmPlaster');

  // Interior hardwood flooring: Living Room & Hall
  walnut.addBox(-4.85, 0.03, -0.5, 7.3, 0.04, 7.3);
  trav.addBox(0.7, 0.03, -0.5, 3.8, 0.04, 7.3);
  trav.addBox(5.1, 0.03, -0.5, 5.0, 0.04, 7.3);

  // North Rear Architectural Stone Spine Wall (X: -8.6 .. +11.4, Z: -4.2)
  trav.addBox(1.4, 1.65, -4.2, 20.0, 3.3, 0.34);

  // Living Room West Feature Wall (partial stone + glass corner)
  trav.addBox(-8.55, 1.65, -2.5, 0.32, 3.3, 3.6);
  // Slatted walnut acoustic wall inside Living Room rear
  for (let i = 0; i < 18; i++) {
    walnut.addBox(-7.4 + i * 0.28, 1.62, -3.98, 0.11, 3.05, 0.08);
  }

  // Interior Partition Walls with open architectural portals
  // Between Living (-1.2) and Entrance Hall
  plaster.addBox(-1.2, 1.62, -2.7, 0.18, 3.16, 2.8);
  // Between Entrance Hall (+2.6) and Kitchen
  plaster.addBox(2.6, 1.62, -2.6, 0.18, 3.16, 3.0);
  // Between Kitchen (+7.6) and Garage
  trav.addBox(7.6, 1.65, -0.9, 0.3, 3.3, 6.8);

  // Garage East Outer Stone Wall & Roof Slab
  trav.addBox(11.35, 1.65, -0.9, 0.32, 3.3, 6.8);
  trav.addBox(9.5, 3.22, -0.8, 4.1, 0.24, 7.2);
  // Garage Portal Header
  bronze.addBox(9.5, 2.82, 2.38, 3.4, 0.52, 0.26);

  // Ground Floor Ceiling / Mid-Level Cantilevered Slab & Walnut Soffit
  trav.addBox(-0.3, 3.28, -0.4, 17.8, 0.22, 8.1);
  walnut.addBox(-0.3, 3.15, -0.4, 17.5, 0.05, 7.9);

  // Architectural Curtain Glass & Dark Bronze Mullions: Living Pavilion + Kitchen
  // Living Front Glass (X: -8.4 .. -1.3, Z: +3.18)
  glass.addBox(-4.85, 1.6, 3.18, 7.0, 3.08, 0.04);
  // Living West Corner Glass (X: -8.52, Z: -0.7 .. +3.18)
  glass.addBox(-8.52, 1.6, 1.24, 0.04, 3.08, 3.88);
  for (const x of [-8.52, -6.7, -4.85, -3.0, -1.25]) {
    bronze.addBox(x, 1.6, 3.19, 0.07, 3.14, 0.09);
  }
  bronze.addBox(-4.85, 3.12, 3.19, 7.35, 0.08, 0.11);
  bronze.addBox(-4.85, 0.06, 3.19, 7.35, 0.08, 0.11);

  // Entrance Hall Glass Sidelights & Pivoting Walnut Door (X: -1.2 .. +2.6, Z: +3.18)
  glass.addBox(-0.45, 1.6, 3.18, 1.35, 3.08, 0.04);
  glass.addBox(1.95, 1.6, 3.18, 1.15, 3.08, 0.04);
  // Pivot Front Door Leaf (Walnut + Bronze Trim)
  walnut.addBox(0.78, 1.48, 3.18, 1.12, 2.88, 0.09);
  bronze.addBox(0.78, 2.98, 3.19, 1.2, 0.12, 0.12);
  bronze.addBox(1.18, 1.42, 3.26, 0.04, 1.25, 0.05); // Architectural door pull
  bronze.addBox(1.18, 1.18, 3.25, 0.14, 0.24, 0.04); // Smart lock escutcheon

  // Kitchen South & East Glass + Vertical Cedar Sun Louvers
  glass.addBox(5.1, 1.6, 3.18, 4.85, 3.08, 0.04);
  for (const x of [2.65, 4.3, 5.95, 7.52]) {
    bronze.addBox(x, 1.6, 3.19, 0.07, 3.14, 0.09);
  }
  for (let i = 0; i < 7; i++) {
    cedar.addBox(6.1 + i * 0.22, 1.6, 3.36, 0.06, 3.08, 0.18);
  }
}

// ============================================================================
// 3. UPPER FLOOR CANTILEVERED MASTER SUITE & ROOF-RIDGE CANOPY (Y = 3.35 .. 7.8)
// ============================================================================
{
  const trav = bucket('UpperStructure', 'TravertineStone');
  const walnut = bucket('UpperTimber', 'OiledWalnut');
  const cedar = bucket('UpperLouvers', 'WarmCedar');
  const bronze = bucket('UpperMullions', 'BrushedBronze');
  const glass = bucket('UpperGlass', 'ArchitecturalGlass');

  // Master Suite Floor (cantilevered over Living & Pool edge: X: -7.8 .. +2.9, Z: -4.1 .. +2.9)
  walnut.addBox(-2.45, 3.41, -0.6, 10.6, 0.06, 6.9);

  // Rear & West Architectural Walls of Master Suite
  trav.addBox(-2.45, 4.9, -4.05, 10.7, 3.0, 0.28);
  trav.addBox(-7.7, 4.9, -2.1, 0.28, 3.0, 3.9);

  // Vertical Cedar Privacy Screen on West Cantilever
  for (let i = 0; i < 9; i++) {
    cedar.addBox(-7.74, 4.9, -0.05 + i * 0.34, 0.08, 2.96, 0.14);
  }

  // Master Suite Panoramic Curtain Glass (South Z=+2.82 & East X=+2.82)
  glass.addBox(-2.45, 4.88, 2.82, 10.3, 2.92, 0.04);
  glass.addBox(2.82, 4.88, -0.6, 0.04, 2.92, 6.8);
  for (const x of [-7.65, -5.1, -2.45, 0.2, 2.82]) {
    bronze.addBox(x, 4.88, 2.83, 0.07, 2.98, 0.09);
  }

  // Upper East Rooftop Terrace Balustrade (X: +2.9 .. +7.5, Z: -3.6 .. +2.8, Y: 3.4..4.45)
  trav.addBox(5.2, 3.41, -0.4, 4.5, 0.06, 6.6);
  glass.addBox(5.2, 3.92, 2.85, 4.5, 0.96, 0.04);
  glass.addBox(7.45, 3.92, -0.4, 0.04, 0.96, 6.5);
  bronze.addBox(5.2, 4.42, 2.85, 4.56, 0.05, 0.07);
  bronze.addBox(7.45, 4.42, -0.4, 0.07, 0.05, 6.56);

  // ICONIC CANGZE ROOF-RIDGE CANOPY (Sweeping Modernist Asymmetric Ridge + Horizontal Eaves)
  // Left horizontal eave (-9.1 .. -6.8) -> Ascending ridge (-6.8 .. -2.4, Y: 6.38 -> 7.62)
  // -> Descending ridge (-2.4 .. +2.0, Y: 7.62 -> 6.38) -> Right horizontal eave (+2.0 .. +4.3)
  walnut.addBox(-7.95, 6.46, -0.55, 2.35, 0.18, 8.2);
  walnut.addSlopedSlab(-6.85, 6.38, -2.4, 7.62, -4.65, 3.55, 0.2);
  walnut.addSlopedSlab(-2.4, 7.62, 2.05, 6.38, -4.65, 3.55, 0.2);
  walnut.addBox(3.2, 6.46, -0.55, 2.35, 0.18, 8.2);

  // Bronze fascia trim along roof ridge silhouette
  bronze.addBox(-7.95, 6.56, 3.56, 2.38, 0.07, 0.08);
  bronze.addSlopedSlab(-6.85, 6.54, -2.4, 7.78, 3.51, 3.59, 0.07);
  bronze.addSlopedSlab(-2.4, 7.78, 2.05, 6.54, 3.51, 3.59, 0.07);
  bronze.addBox(3.2, 6.56, 3.56, 2.38, 0.07, 0.08);

  // Clerestory glass gable & bronze king-post mullion + warm recessed ridge soffit light bar
  glass.addTriangle([-6.85, 6.38, 2.82], [2.05, 6.38, 2.82], [-2.4, 7.6, 2.82], [0, 0, 1]);
  bronze.addBox(-2.4, 6.98, 2.83, 0.07, 1.22, 0.09);
  bronze.addBox(-2.4, 6.36, 2.83, 9.1, 0.06, 0.09);
  const hearth = bucket('RoofHearthEmblem', 'HearthEmissive');
  hearth.addBox(-2.4, 7.52, -0.55, 0.14, 0.05, 6.4);
}

// ============================================================================
// 4. INTERIOR FURNISHINGS, STAIRCASE, SMART DEVICES & CANGZE HUB CORE
// ============================================================================
{
  const walnut = bucket('FurnitureWood', 'OiledWalnut');
  const trav = bucket('FurnitureStone', 'TravertineStone');
  const linen = bucket('FurnitureLinen', 'BoucleLinen');
  const charcoal = bucket('FurnitureDark', 'CharcoalFabric');
  const bronze = bucket('FurnitureBronze', 'BrushedBronze');
  const hearth = bucket('FixtureGlow', 'HearthEmissive');
  const hubMat = bucket('CangzeHubCore', 'HubSapphire');
  const glass = bucket('StairGlass', 'ArchitecturalGlass');

  // --- Living Pavilion Furnishings ---
  // Area Rug
  linen.addBox(-4.85, 0.055, -0.35, 4.5, 0.02, 3.6);
  // L-Shaped Modular Bouclé Sofa
  walnut.addBox(-4.8, 0.14, -1.55, 3.4, 0.12, 1.05);
  linen.addBox(-4.8, 0.34, -1.52, 3.32, 0.28, 0.98);
  linen.addBox(-4.8, 0.64, -1.94, 3.32, 0.42, 0.22); // backrest
  walnut.addBox(-6.05, 0.14, -0.35, 1.05, 0.12, 1.45);
  linen.addBox(-6.05, 0.34, -0.35, 0.98, 0.28, 1.4); // chaise
  // Accent pillows
  charcoal.addBox(-3.55, 0.56, -1.68, 0.42, 0.32, 0.22);
  charcoal.addBox(-5.95, 0.56, -1.68, 0.42, 0.32, 0.22);

  // Monolithic Travertine Coffee Table
  trav.addBox(-4.45, 0.22, 0.05, 1.65, 0.34, 0.95);
  bronze.addCylinder(-4.15, 0.39, 0.05, 0.14, 0.11, 0.18, 14);

  // Media Credenza & Framed Architectural Canvas on Rear Wall
  walnut.addBox(-4.85, 0.36, -3.72, 3.6, 0.52, 0.48);
  bronze.addBox(-4.85, 1.72, -3.9, 2.2, 1.24, 0.05);
  linen.addBox(-4.85, 1.72, -3.86, 2.06, 1.1, 0.03);

  // Sculptural Arc Floor Lamp (light.living_lamp)
  bronze.addCylinder(-7.15, 0.05, -2.35, 0.24, 0.24, 0.07, 16);
  bronze.addCylinder(-7.15, 0.12, -2.35, 0.03, 0.025, 2.15, 10);
  bronze.addBox(-6.8, 2.26, -2.05, 0.72, 0.04, 0.04);
  hearth.addCylinder(-6.48, 2.08, -1.9, 0.22, 0.14, 0.18, 16);

  // Living Ceiling Linear Light Cove & Concealed Thermostat Diffuser
  hearth.addBox(-4.85, 3.1, -0.45, 2.8, 0.04, 0.14);
  bronze.addBox(-4.85, 2.92, -3.96, 1.8, 0.12, 0.08);

  // --- Entrance Hall & Floating Staircase + Cangze Hub Core ---
  // Floating Architectural Staircase (X: -0.8 .. +2.1, Z: -3.55 .. -2.55)
  for (let step = 0; step < 12; step++) {
    const sx = -0.65 + step * 0.25;
    const sy = 0.26 + step * 0.265;
    walnut.addBox(sx, sy, -3.15, 0.34, 0.07, 1.05);
    bronze.addBox(sx, sy - 0.06, -3.15, 0.28, 0.05, 0.14);
  }
  glass.addBox(0.72, 2.15, -2.58, 3.1, 0.95, 0.03);

  // Central Cangze Hub Core Monolith (Local Private AI Hub)
  charcoal.addBox(0.65, 0.66, -1.35, 0.44, 1.24, 0.34);
  hubMat.addBox(0.65, 1.02, -1.16, 0.26, 0.08, 0.04);
  hearth.addBox(0.65, 0.88, -1.16, 0.1, 0.1, 0.04);

  // Hall Security Panel
  charcoal.addBox(2.46, 1.42, 1.55, 0.06, 0.34, 0.24);
  hubMat.addBox(2.42, 1.45, 1.55, 0.02, 0.18, 0.16);

  // --- Kitchen & Dining Waterfall Island ---
  // Rear Tall Walnut Cabinetry & Countertop Niche
  walnut.addBox(5.1, 1.55, -3.72, 4.5, 3.0, 0.58);
  trav.addBox(5.1, 1.32, -3.55, 2.8, 0.78, 0.54);
  // Waterfall Travertine Island
  trav.addBox(5.1, 0.48, -0.25, 3.1, 0.9, 1.12);
  walnut.addBox(5.1, 0.44, 0.28, 2.86, 0.82, 0.08);
  // 3 Minimalist Bar Stools
  for (const sx of [4.1, 5.1, 6.1]) {
    bronze.addCylinder(sx, 0.05, 0.78, 0.03, 0.03, 0.62, 8);
    walnut.addCylinder(sx, 0.67, 0.78, 0.2, 0.2, 0.06, 14);
  }
  // Kitchen Linear Brass Pendant (light.kitchen_pendant)
  bronze.addBox(5.1, 2.38, -0.25, 2.2, 0.06, 0.08);
  hearth.addBox(5.1, 2.33, -0.25, 2.1, 0.03, 0.06);
  // Espresso Machine (switch.coffee_machine)
  bronze.addBox(6.05, 1.12, -3.52, 0.42, 0.38, 0.36);

  // --- Garage EV Silhouette ---
  charcoal.addBox(9.5, 0.54, -1.0, 1.86, 0.68, 3.9);
  charcoal.addBox(9.5, 1.04, -1.15, 1.58, 0.46, 2.1);
  hearth.addBox(9.5, 0.58, 0.96, 1.48, 0.06, 0.04);

  // --- Upper Master Suite Furnishings ---
  // Floating Walnut Platform Bed + Upholstered Headboard + Linen Duvet
  walnut.addBox(-3.4, 3.62, -2.05, 2.95, 0.22, 2.55);
  linen.addBox(-3.4, 4.22, -3.28, 3.1, 1.12, 0.22); // headboard
  linen.addBox(-3.4, 3.84, -1.98, 2.68, 0.26, 2.28); // mattress + duvet
  charcoal.addBox(-3.4, 3.98, -1.25, 2.7, 0.06, 0.68); // throw blanket
  linen.addBox(-3.95, 4.04, -2.88, 0.78, 0.18, 0.44); // left pillow
  linen.addBox(-2.85, 4.04, -2.88, 0.78, 0.18, 0.44); // right pillow
  // Twin Nightstands + Warm Bedside Pendants
  walnut.addBox(-5.25, 3.68, -3.05, 0.62, 0.32, 0.52);
  walnut.addBox(-1.55, 3.68, -3.05, 0.62, 0.32, 0.52);
  hearth.addSphere(-5.25, 4.32, -3.05, 0.13, 0.13, 0.13, 8, 12);
  hearth.addSphere(-1.55, 4.32, -3.05, 0.13, 0.13, 0.13, 8, 12);
  // Master Suite Whisper Climate Unit
  bronze.addBox(-3.4, 5.98, -3.86, 1.65, 0.22, 0.24);
  // Upper Rooftop Terrace Lounge Chairs
  walnut.addBox(4.6, 3.58, 0.6, 0.85, 0.22, 1.55);
  linen.addBox(4.6, 3.72, 0.6, 0.78, 0.12, 1.48);
  walnut.addBox(6.0, 3.58, 0.6, 0.85, 0.22, 1.55);
  linen.addBox(6.0, 3.72, 0.6, 0.78, 0.12, 1.48);
}

// ============================================================================
// 5. COURTYARD SCULPTURAL TREE & LANDSCAPE BOLLARDS
// ============================================================================
{
  const trunk = bucket('CourtyardTreeTrunk', 'OiledWalnut');
  const canopy = bucket('CourtyardTreeCanopy', 'FoliageCanopy');
  const bronze = bucket('LandscapeBollards', 'BrushedBronze');
  const hearth = bucket('LandscapeGlow', 'HearthEmissive');

  // Sculptural Courtyard Olive Tree in West Basalt Planter (frames villa without blocking glass)
  const planter = bucket('CourtyardPlanter', 'BasaltStone');
  planter.addBox(-10.15, 0.18, 4.35, 1.72, 0.42, 1.72);
  trunk.addCylinder(-10.15, 0.35, 4.35, 0.19, 0.12, 2.15, 12);
  trunk.addCylinder(-9.82, 1.55, 4.15, 0.09, 0.05, 1.25, 10);
  trunk.addCylinder(-10.45, 1.62, 4.55, 0.08, 0.05, 1.2, 10);

  canopy.addSphere(-10.15, 3.05, 4.35, 1.38, 0.68, 1.28, 12, 18);
  canopy.addSphere(-9.55, 2.65, 4.02, 0.98, 0.5, 0.92, 12, 18);
  canopy.addSphere(-10.68, 2.72, 4.65, 0.95, 0.48, 0.88, 12, 18);

  // Pathway Bollard Lights along Terrace & Stepping Stones
  for (const [bx, bz] of [
    [2.1, 6.6],
    [2.1, 4.3],
    [6.8, 3.9],
    [10.8, 3.2],
  ]) {
    bronze.addCylinder(bx, 0.02, bz, 0.07, 0.07, 0.56, 12);
    hearth.addCylinder(bx, 0.58, bz, 0.065, 0.065, 0.11, 12);
  }
}

// ============================================================================
// 6. SERIALIZE TO BINARY glTF 2.0 (.glb)
// ============================================================================
function buildGlb() {
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
    if (pad > 0) {
      binParts.push(new Uint8Array(pad));
    }
    byteOffset += u8.byteLength + pad;
    return viewIndex;
  }

  for (const b of buckets.values()) {
    if (b.indices.length === 0) continue;

    const posArr = new Float32Array(b.positions);
    const normArr = new Float32Array(b.normals);
    const uvArr = new Float32Array(b.uvs);
    const idxArr = new Uint32Array(b.indices);

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
    const idxView = appendBuffer(idxArr, 34963);

    const posAcc = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: posArr.length / 3,
      type: 'VEC3',
      min,
      max,
    });

    const normAcc = accessors.length;
    accessors.push({
      bufferView: normView,
      componentType: 5126,
      count: normArr.length / 3,
      type: 'VEC3',
    });

    const uvAcc = accessors.length;
    accessors.push({
      bufferView: uvView,
      componentType: 5126,
      count: uvArr.length / 2,
      type: 'VEC2',
    });

    const idxAcc = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: 5125,
      count: idxArr.length,
      type: 'SCALAR',
    });

    const meshIndex = meshes.length;
    meshes.push({
      name: b.name,
      primitives: [
        {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
            TEXCOORD_0: uvAcc,
          },
          indices: idxAcc,
          material: b.materialIndex,
        },
      ],
    });

    nodes.push({
      name: b.name,
      mesh: meshIndex,
    });
  }

  const rootNodeIndex = nodes.length;
  nodes.push({
    name: 'CangzeResidenceRoot',
    children: nodes.map((_, idx) => idx),
  });

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Cangze Parametric Architectural Builder v1.0',
    },
    scene: 0,
    scenes: [
      {
        name: 'CangzeSanctuaryResidence',
        nodes: [rootNodeIndex],
      },
    ],
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
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return {
    glb: Buffer.concat([header, jsonChunkHeader, jsonPadded, binChunkHeader, binBuffer]),
    meshCount: meshes.length,
    triangleCount: [...buckets.values()].reduce((acc, b) => acc + b.indices.length / 3, 0),
  };
}

mkdirSync(dirname(outPath), { recursive: true });
const { glb, meshCount, triangleCount } = buildGlb();
writeFileSync(outPath, glb);
process.stdout.write(
  `Generated ${outPath} (${(glb.byteLength / 1024).toFixed(1)} KB, ${meshCount} architectural mesh groups, ${triangleCount} triangles)\n`,
);
