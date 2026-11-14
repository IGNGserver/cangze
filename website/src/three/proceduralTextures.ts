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
  // 1. Oiled Walnut Wood Grain + Roughness
  const [wCanvas, wCtx] = makeCanvas(256, 256);
  const [wrCanvas, wrCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#6c452b';
  wCtx.fillRect(0, 0, 256, 256);
  wrCtx.fillStyle = '#888888';
  wrCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y++) {
    const wave = Math.sin(y * 0.11) * 10 + Math.sin(y * 0.37) * 4;
    const tone = Math.floor(wave);
    wCtx.fillStyle = `rgb(${106 + tone}, ${68 + Math.floor(tone * 0.65)}, ${43 + Math.floor(tone * 0.45)})`;
    wCtx.fillRect(0, y, 256, 1);
    const rVal = 128 - Math.floor(wave * 1.4);
    wrCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
    wrCtx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 160; i++) {
    const x = (i * 73) % 256;
    const y = (i * 41) % 256;
    wCtx.fillStyle = i % 2 === 0 ? 'rgba(38, 20, 10, 0.14)' : 'rgba(155, 108, 72, 0.1)';
    wCtx.fillRect(x, y, 42, 1.5);
  }

  const walnutColor = new THREE.CanvasTexture(wCanvas);
  walnutColor.colorSpace = THREE.SRGBColorSpace;
  walnutColor.wrapS = walnutColor.wrapT = THREE.RepeatWrapping;
  walnutColor.repeat.set(2, 2);

  const walnutRoughness = new THREE.CanvasTexture(wrCanvas);
  walnutRoughness.wrapS = walnutRoughness.wrapT = THREE.RepeatWrapping;
  walnutRoughness.repeat.set(2, 2);

  // 2. Honed Travertine Stone Veins & Subtle Pores
  const [tCanvas, tCtx] = makeCanvas(256, 256);
  const [tbCanvas, tbCtx] = makeCanvas(256, 256);
  tCtx.fillStyle = '#dad0be';
  tCtx.fillRect(0, 0, 256, 256);
  tbCtx.fillStyle = '#909090';
  tbCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    const drift = Math.sin(y * 0.06) * 8 + Math.cos(y * 0.19) * 5;
    tCtx.fillStyle = `rgba(${212 + Math.floor(drift)}, ${201 + Math.floor(drift)}, ${183 + Math.floor(drift)}, 0.45)`;
    tCtx.fillRect(0, y, 256, 2);
  }
  // Architectural ashlar stone joint lines
  tCtx.strokeStyle = 'rgba(120, 110, 96, 0.22)';
  tCtx.lineWidth = 1;
  tbCtx.strokeStyle = 'rgba(45, 45, 45, 0.55)';
  tbCtx.lineWidth = 1.5;
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
  for (let i = 0; i < 220; i++) {
    const px = (i * 97) % 256;
    const py = (i * 53) % 256;
    tbCtx.fillStyle = i % 3 === 0 ? '#686868' : '#ababab';
    tbCtx.fillRect(px, py, 3, 1.5);
  }

  const travertineColor = new THREE.CanvasTexture(tCanvas);
  travertineColor.colorSpace = THREE.SRGBColorSpace;
  travertineColor.wrapS = travertineColor.wrapT = THREE.RepeatWrapping;
  travertineColor.repeat.set(2, 2);

  const travertineBump = new THREE.CanvasTexture(tbCanvas);
  travertineBump.wrapS = travertineBump.wrapT = THREE.RepeatWrapping;
  travertineBump.repeat.set(2, 2);

  // 3. Woven Bouclé Linen Bump
  const [lCanvas, lCtx] = makeCanvas(128, 128);
  lCtx.fillStyle = '#808080';
  lCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    for (let x = 0; x < 128; x += 4) {
      const bright = (x + y) % 8 === 0 ? 168 : 108;
      lCtx.fillStyle = `rgb(${bright}, ${bright}, ${bright})`;
      lCtx.fillRect(x, y, 3, 3);
    }
  }
  const linenBump = new THREE.CanvasTexture(lCanvas);
  linenBump.wrapS = linenBump.wrapT = THREE.RepeatWrapping;
  linenBump.repeat.set(8, 8);

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
