import * as THREE from 'three';

/**
 * Generates crisp procedural PBR CanvasTextures for architectural surfaces
 * (honed travertine, oiled walnut timber, brushed bronze, bouclé linen, water ripples, radial light halos)
 * so materials exhibit realistic grain and micro-roughness without external image bloat.
 */

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  return [canvas, ctx];
}

export interface ArchitecturalTexturePack {
  walnutColor: THREE.CanvasTexture;
  walnutRoughness: THREE.CanvasTexture;
  travertineColor: THREE.CanvasTexture;
  travertineBump: THREE.CanvasTexture;
  linenBump: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  glowSprite: THREE.CanvasTexture;
  dispose: () => void;
}

export function createArchitecturalTextures(): ArchitecturalTexturePack {
  // 1. Neutral High-Value Wood Grain + Roughness (tinted cleanly via glTF COLOR_0)
  const [wCanvas, wCtx] = makeCanvas(256, 256);
  const [wrCanvas, wrCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#ece8e2';
  wCtx.fillRect(0, 0, 256, 256);
  wrCtx.fillStyle = '#8a8a8a';
  wrCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y++) {
    const wave = Math.sin(y * 0.12) * 11 + Math.sin(y * 0.41) * 5 + Math.cos(y * 0.05) * 6;
    const v = Math.max(204, Math.min(252, Math.round(234 + wave)));
    wCtx.fillStyle = `rgb(${v}, ${Math.max(198, v - 3)}, ${Math.max(190, v - 8)})`;
    wCtx.fillRect(0, y, 256, 1);
    const rVal = Math.max(96, Math.min(180, Math.round(136 - wave * 1.6)));
    wrCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
    wrCtx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 240; i++) {
    const x = (i * 73) % 256;
    const y = (i * 41) % 256;
    const len = 24 + (i % 4) * 12;
    wCtx.fillStyle = i % 3 === 0 ? 'rgba(135, 118, 100, 0.16)' : 'rgba(255, 252, 246, 0.14)';
    wCtx.fillRect(x, y, len, 1.2);
  }

  const walnutColor = new THREE.CanvasTexture(wCanvas);
  walnutColor.colorSpace = THREE.SRGBColorSpace;
  walnutColor.wrapS = walnutColor.wrapT = THREE.RepeatWrapping;
  walnutColor.repeat.set(1, 1);

  const walnutRoughness = new THREE.CanvasTexture(wrCanvas);
  walnutRoughness.wrapS = walnutRoughness.wrapT = THREE.RepeatWrapping;
  walnutRoughness.repeat.set(1, 1);

  // 2. Neutral High-Value Architectural Stone Veins & Pores (tinted cleanly via glTF COLOR_0)
  const [tCanvas, tCtx] = makeCanvas(256, 256);
  const [tbCanvas, tbCtx] = makeCanvas(256, 256);
  tCtx.fillStyle = '#f2efe9';
  tCtx.fillRect(0, 0, 256, 256);
  tbCtx.fillStyle = '#909090';
  tbCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    const drift = Math.sin(y * 0.065) * 9 + Math.cos(y * 0.21) * 5;
    const v = Math.max(222, Math.min(252, Math.round(240 + drift)));
    tCtx.fillStyle = `rgba(${v}, ${v - 2}, ${v - 6}, 0.55)`;
    tCtx.fillRect(0, y, 256, 2);
  }
  // Architectural ashlar stone joint lines
  tCtx.strokeStyle = 'rgba(145, 138, 128, 0.18)';
  tCtx.lineWidth = 1;
  tbCtx.strokeStyle = 'rgba(52, 52, 52, 0.45)';
  tbCtx.lineWidth = 1.2;
  for (const jy of [64, 128, 192]) {
    tCtx.beginPath();
    tCtx.moveTo(0, jy);
    tCtx.lineTo(256, jy);
    tCtx.stroke();
    tbCtx.beginPath();
    tbCtx.moveTo(0, jy);
    tbCtx.lineTo(256, jy);
    tbCtx.stroke();
  }
  for (let i = 0; i < 280; i++) {
    const px = (i * 97) % 256;
    const py = (i * 53) % 256;
    tbCtx.fillStyle = i % 3 === 0 ? '#6c6c6c' : '#ababab';
    tbCtx.fillRect(px, py, 3, 1.5);
    tCtx.fillStyle = i % 4 === 0 ? 'rgba(160, 154, 144, 0.12)' : 'rgba(255, 253, 250, 0.12)';
    tCtx.fillRect(px, py, 4, 1.5);
  }

  const travertineColor = new THREE.CanvasTexture(tCanvas);
  travertineColor.colorSpace = THREE.SRGBColorSpace;
  travertineColor.wrapS = travertineColor.wrapT = THREE.RepeatWrapping;
  travertineColor.repeat.set(1, 1);

  const travertineBump = new THREE.CanvasTexture(tbCanvas);
  travertineBump.wrapS = travertineBump.wrapT = THREE.RepeatWrapping;
  travertineBump.repeat.set(1, 1);

  // 3. Finer Woven Bouclé Linen Bump
  const [lCanvas, lCtx] = makeCanvas(128, 128);
  lCtx.fillStyle = '#808080';
  lCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 156 : 108;
      const micro = ((x * 7 + y * 13) % 19) - 9;
      const bright = Math.max(70, Math.min(190, weave + micro));
      lCtx.fillStyle = `rgb(${bright}, ${bright}, ${bright})`;
      lCtx.fillRect(x, y, 2, 2);
    }
  }
  const linenBump = new THREE.CanvasTexture(lCanvas);
  linenBump.wrapS = linenBump.wrapT = THREE.RepeatWrapping;
  linenBump.repeat.set(4, 4);

  // 4. Courtyard Reflecting Water ("泽") Ripple Normal-like Bump Map
  const [wtCanvas, wtCtx] = makeCanvas(256, 256);
  const img = wtCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = (x / 256) * Math.PI * 2;
      const v = (y / 256) * Math.PI * 2;
      const nx = Math.sin(u * 4 + Math.cos(v * 3)) * 0.5 + Math.sin(u * 9 - v * 6) * 0.25;
      const ny = Math.cos(v * 5 + Math.sin(u * 3)) * 0.5 + Math.cos(u * 7 + v * 8) * 0.25;
      const idx = (y * 256 + x) * 4;
      img.data[idx] = Math.floor((nx * 0.35 + 0.5) * 255);
      img.data[idx + 1] = Math.floor((ny * 0.35 + 0.5) * 255);
      img.data[idx + 2] = 245;
      img.data[idx + 3] = 255;
    }
  }
  wtCtx.putImageData(img, 0, 0);
  const waterNormal = new THREE.CanvasTexture(wtCanvas);
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.repeat.set(4, 2);

  // 5. Soft Radial Halo Sprite for Warm Hearth Fixtures & Hub Core
  const [gCanvas, gCtx] = makeCanvas(128, 128);
  const grad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 244, 218, 1)');
  grad.addColorStop(0.28, 'rgba(255, 210, 138, 0.58)');
  grad.addColorStop(0.68, 'rgba(245, 175, 90, 0.14)');
  grad.addColorStop(1, 'rgba(245, 175, 90, 0)');
  gCtx.fillStyle = grad;
  gCtx.fillRect(0, 0, 128, 128);
  const glowSprite = new THREE.CanvasTexture(gCanvas);
  glowSprite.colorSpace = THREE.SRGBColorSpace;

  return {
    walnutColor,
    walnutRoughness,
    travertineColor,
    travertineBump,
    linenBump,
    waterNormal,
    glowSprite,
    dispose: () => {
      walnutColor.dispose();
      walnutRoughness.dispose();
      travertineColor.dispose();
      travertineBump.dispose();
      linenBump.dispose();
      waterNormal.dispose();
      glowSprite.dispose();
    },
  };
}
