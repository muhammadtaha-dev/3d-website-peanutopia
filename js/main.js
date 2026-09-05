/* ============================================================
   PEANUTOPIA — 3D Website Application
   Per spec: D1–D8 (3D), C2 (beats), E1 (homepage), F7 (analytics)
   Single timeline drives camera + jar + DOM (scrub-safe, D5).
   ============================================================ */

'use strict';

/* ---------------- Brand tokens (spec A2.2) ---------------- */
const BRAND = {
  cream: '#F3EEE2', cocoa: '#3B2314', peanut: '#C98A4B',
  gold: '#C9A24B', goldDeep: '#8F6B2E', ink: '#1E120A',
};

/* ---------------- Analytics stub (spec F5) ---------------- */
const track = (event, data = {}) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    console.debug('[PNT analytics]', event, data);
  }
};

/* ---------------- Helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const toast = (() => {
  const el = $('#toast'); let timer;
  return msg => {
    el.textContent = msg; el.classList.add('show');
    clearTimeout(timer); timer = setTimeout(() => el.classList.remove('show'), 2600);
  };
})();

/* ============================================================
   CANVAS TEXTURE PAINTERS (label, lid seal, butter, env)
   ============================================================ */
let T; // THREE namespace, bound at scene init (painters run only after boot)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/* Simplified flexing-mascot painter (echoes the social logo, spec A2.1) */
function drawMascot(ctx, x, y, s, body = BRAND.cocoa, accent = BRAND.gold) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  // flexing arms
  ctx.strokeStyle = body; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-16, 6); ctx.quadraticCurveTo(-34, 2, -30, -14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 6); ctx.quadraticCurveTo(34, 2, 30, -14); ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(-31, -16, 6.5, 0, 7); ctx.fill();   // fists
  ctx.beginPath(); ctx.arc(31, -16, 6.5, 0, 7); ctx.fill();
  // peanut body (waisted)
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.bezierCurveTo(22, -34, 20, -8, 17, 6);
  ctx.bezierCurveTo(15, 20, 10, 30, 0, 30);
  ctx.bezierCurveTo(-10, 30, -15, 20, -17, 6);
  ctx.bezierCurveTo(-20, -8, -22, -34, 0, -34);
  ctx.fill();
  // gold accent seam
  ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-4, -30); ctx.quadraticCurveTo(-14, 0, -6, 26); ctx.stroke();
  // face
  ctx.fillStyle = '#F7EEDD';
  ctx.beginPath(); ctx.arc(-6, -12, 2.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -12, 2.6, 0, 7); ctx.fill();
  ctx.strokeStyle = '#F7EEDD'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -4, 5, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.restore();
}

/* Jar label — matches the real 4-view wrap (front / left / right, bare back).
   Canvas u=0.5 → jar front; u=0.75 → jar's left (ingredients); u=0.25 → jar's right (freshness);
   back gap is transparent so the bare glass+butter shows, like the back photo.
   When the real jar photos are available, the actual label artwork is composited
   from the photos (spec A2.1: photos are the source of truth); procedural art is the fallback. */
function paintLabelTexture(photos) {
  const W = 2048, H = 512, [c, ctx] = makeCanvas(W, H);

  // --- REAL PHOTO COMPOSITE (preferred) ---
  if (photos && photos.front && photos.left && photos.right) {
    // feathered crop: soft alpha edges so photo segments blend into each other and the bare jar
    const feather = (img, sx, sy, sw, sh, dx, dw, f = 42) => {
      const off = document.createElement('canvas');
      off.width = dw; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(img,
        sx * img.naturalWidth, sy * img.naturalHeight,
        sw * img.naturalWidth, sh * img.naturalHeight,
        0, 0, dw, H);
      const g = octx.createLinearGradient(0, 0, dw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(f / dw, 'rgba(0,0,0,1)');
      g.addColorStop(1 - f / dw, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      octx.globalCompositeOperation = 'destination-in';
      octx.fillStyle = g;
      octx.fillRect(0, 0, dw, H);
      ctx.drawImage(off, dx, 0);
    };
    // front oval (from front view)  ·  ingredients panel (left view)  ·  freshness panel (right view)
    feather(photos.front, 0.34, 0.24, 0.32, 0.64, 745, 560);
    feather(photos.left, 0.26, 0.325, 0.57, 0.50, 1240, 620);
    feather(photos.right, 0.19, 0.33, 0.62, 0.49, 190, 620);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // --- PROCEDURAL FALLBACK ---
  const GAP = 175; // transparent back gap around the seam
  const X0 = GAP, X1 = W - GAP;

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const patternRow = (y0, y1) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(X0 + 10, y0, X1 - X0 - 20, y1 - y0); ctx.clip();
    ctx.fillStyle = BRAND.cream; ctx.fillRect(X0, y0, X1 - X0, y1 - y0);
    const rows = y1 - y0 > 120 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < 26; i++) {
        drawPeanutMotif(ctx, X0 + 30 + i * 68 + (row % 2) * 30, y0 + (y1 - y0) / 2 + (row - (rows - 1) / 2) * 62, 1.0, (i * 37 + row * 53) % 360);
      }
    }
    ctx.restore();
  };

  // continuous label band with peanut-pattern strips (like the real wrap)
  roundRect(X0, 0, X1 - X0, H, 26);
  ctx.fillStyle = BRAND.cream; ctx.fill();
  patternRow(0, 108); patternRow(H - 108, H);
  ctx.fillStyle = BRAND.gold;
  ctx.fillRect(X0 + 10, 112, X1 - X0 - 20, 7);
  ctx.fillRect(X0 + 10, H - 119, X1 - X0 - 20, 7);

  // --- side panel: ingredients (u=0.75 → jar's left side) ---
  const panel = (cx, drawText) => {
    roundRect(cx - 215, 140, 430, 232, 18);
    ctx.fillStyle = BRAND.cream; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = BRAND.gold; ctx.stroke();
    drawText(cx);
  };
  panel(1536, cx => {
    ctx.textAlign = 'left'; ctx.fillStyle = BRAND.cocoa;
    ctx.font = "800 37px Arial, sans-serif";
    ctx.fillText('Ingredients:', cx - 185, 200);
    ctx.font = "400 33px Arial, sans-serif";
    ctx.fillText('Roasted Peanuts,', cx - 185, 245);
    ctx.fillText('Gurr Shakar.', cx - 185, 285);
    ctx.fillStyle = BRAND.gold;
    ctx.fillRect(cx - 185, 306, 330, 3);
    ctx.fillStyle = BRAND.cocoa;
    ctx.font = "600 30px Arial, sans-serif";
    ctx.fillText('Net Wt 500g', cx - 185, 348);
  });

  // --- side panel: freshness + social (u=0.25 → jar's right side) ---
  panel(512, cx => {
    ctx.textAlign = 'center'; ctx.fillStyle = BRAND.cocoa;
    ctx.font = "600 34px Arial, sans-serif";
    ctx.fillText('Use within 90 days.', cx, 242);
    ctx.fillStyle = BRAND.goldDeep;
    ctx.font = "700 32px Arial, sans-serif";
    ctx.fillText('@peanutopia_official', cx, 300);
  });

  // --- central oval plaque (front) ---
  const cx = W / 2, cy = H / 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, 335, 235, 0, 0, 7);
  ctx.fillStyle = BRAND.cream; ctx.fill();
  ctx.lineWidth = 14; ctx.strokeStyle = BRAND.gold; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, 313, 214, 0, 0, 7);
  ctx.lineWidth = 2.5; ctx.stroke();

  // mascot + wordmark + copy
  drawMascot(ctx, cx, cy - 150, 1.15);
  ctx.textAlign = 'center'; ctx.fillStyle = BRAND.cocoa;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '7px';
  ctx.font = "800 76px 'Arial Black', Arial, sans-serif";
  ctx.fillText('PEANUTOPIA', cx, cy + 42);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.font = "600 25px Arial, sans-serif";
  ctx.fillText('STRONGER FUEL. CLEANER POWER.', cx, cy + 84);
  ctx.fillStyle = BRAND.gold;
  ctx.fillRect(cx - 150, cy + 102, 300, 3);
  ctx.fillStyle = BRAND.cocoa;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.font = "700 40px Arial, sans-serif";
  ctx.fillText('100% Natural Peanut Butter', cx, cy + 152);
  ctx.font = "400 25px Arial, sans-serif";
  ctx.fillText('Net Wt 500g', cx, cy + 192);

  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function drawPeanutMotif(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot * Math.PI / 180); ctx.scale(s, s);
  ctx.fillStyle = BRAND.cocoa;
  ctx.beginPath(); ctx.ellipse(0, -7, 9, 12, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 8, 9, 11, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = BRAND.cream; ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(-6, i * 6 - 2); ctx.lineTo(6, i * 6 - 6); ctx.stroke();
  }
  ctx.restore();
}

/* Lid-top seal — echoes the gold-embossed cap sticker (spec A2.1 #3) */
function paintSealTexture() {
  const S = 512, [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = BRAND.cream; ctx.beginPath(); ctx.arc(256, 256, 250, 0, 7); ctx.fill();
  ctx.lineWidth = 16; ctx.strokeStyle = BRAND.gold;
  ctx.beginPath(); ctx.arc(256, 256, 238, 0, 7); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(256, 256, 218, 0, 7); ctx.stroke();
  // ornament dots + sparkles
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    ctx.fillStyle = BRAND.gold;
    ctx.beginPath(); ctx.arc(256 + Math.cos(a) * 196, 256 + Math.sin(a) * 196, 5, 0, 7); ctx.fill();
  }
  drawMascot(ctx, 256, 170, 1.25);
  ctx.textAlign = 'center'; ctx.fillStyle = BRAND.cocoa;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
  ctx.font = "800 58px 'Arial Black', Arial, sans-serif";
  ctx.fillText('PEANUTOPIA', 256, 330);
  ctx.font = "600 22px Arial, sans-serif";
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText('STRONGER FUEL. CLEANER POWER.', 256, 372);
  // 4-point sparkles
  const spark = (x, y, r) => {
    ctx.fillStyle = BRAND.gold; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  };
  spark(150, 420, 12); spark(362, 420, 12);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/* Crunchy butter surface — uses the real butter from the back-view photo when available */
function paintButterTexture(backImg) {
  const S = 512, [c, ctx] = makeCanvas(S, S);
  if (backImg) {
    const W = backImg.naturalWidth, H = backImg.naturalHeight;
    ctx.drawImage(backImg, W * 0.27, H * 0.30, W * 0.46, H * 0.42, 0, 0, S, S);
  } else {
    ctx.fillStyle = BRAND.peanut; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(120,74,30,.5)' : 'rgba(240,205,150,.4)';
      const r = Math.random() * 2.6 + 0.6;
      ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, r, 0, 7); ctx.fill();
    }
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

/* Soft radial contact shadow */
function paintShadowTexture() {
  const S = 256, [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  g.addColorStop(0, 'rgba(30,18,10,.55)'); g.addColorStop(1, 'rgba(30,18,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return new T.CanvasTexture(c);
}

/* FULL-PHOTO jar body wrap (2048×1024) — the real photos, used as-is.
   All four views are re-projected onto true cylinder angles (arcsine unwrap):
   front 0°, right-view 90°, back 180°, left-view 270° — each crossfaded into the
   next, so every angle of the jar shows sharp, real photo data with real proportions.
   Fallback (no photos): procedural label band on a butter-coloured body. */
function paintBodyTexture(photos) {
  const W = 2048, H = 1024, [c, ctx] = makeCanvas(W, H);
  const R = Math.PI / 180;

  // cylindrical unwrap: column i of the output represents jar angle a (degrees);
  // the flat photo compresses angles (x = r·sin a), so we sample with the inverse
  // (arcsine) mapping column-by-column. aC = which jar angle the photo faces.
  const unwrap = (img, cx, halfW, top, ch, dw, aC, a0, a1) => {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const off = document.createElement('canvas');
    off.width = dw; off.height = H;
    const o = off.getContext('2d');
    for (let i = 0; i < dw; i++) {
      const a = (a0 + (a1 - a0) * i / (dw - 1)) * R;
      const sx = (cx + Math.sin(a - aC * R) * halfW) * iw;
      o.drawImage(img, sx - 0.8, top * ih, 1.6, ch * ih, i, 0, 1, H);
    }
    return off;
  };
  // soft alpha ramps on the left/right edges for crossfading into the neighbour view
  const ramp = (off, left, right) => {
    const o = off.getContext('2d');
    const g = o.createLinearGradient(0, 0, off.width, 0);
    g.addColorStop(0, left > 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
    if (left > 0) g.addColorStop(left / off.width, 'rgba(0,0,0,1)');
    if (right > 0) g.addColorStop(1 - right / off.width, 'rgba(0,0,0,1)');
    g.addColorStop(1, right > 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
    o.globalCompositeOperation = 'destination-in';
    o.fillStyle = g;
    o.fillRect(0, 0, off.width, H);
    return off;
  };
  // match a photo's white balance to the front photo so seams are invisible
  const matchTo = (off, ref) => {
    const mean = (cnv) => {
      const d = cnv.getContext('2d').getImageData(cnv.width * 0.2, 0, cnv.width * 0.6, H).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return [r / n, g / n, b / n];
    };
    const [rr, rg, rb] = mean(ref);
    const [sr, sg, sb] = mean(off);
    const k = v => Math.min(1.25, Math.max(0.8, v));
    const kr = k(rr / sr), kg = k(rg / sg), kb = k(rb / sb);
    const o = off.getContext('2d');
    const id = o.getImageData(0, 0, off.width, H);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) { d[i] *= kr; d[i + 1] *= kg; d[i + 2] *= kb; }
    o.putImageData(id, 0, 0);
    return off;
  };

  if (photos && photos.front && photos.back && photos.right && photos.left) {
    // jar geometry per photo: centre x / half-width (fractions, inside the silhouette)
    const front = ramp(unwrap(photos.front, 0.503, 0.162, 0.33, 0.545, 1024, 0, -90, 90), 70, 90);
    const fresh = ramp(unwrap(photos.right, 0.50, 0.238, 0.32, 0.55, 1024, 90, 0, 180), 0, 90);
    const back  = unwrap(photos.back, 0.50, 0.235, 0.315, 0.56, 1024, 180, 90, 270);
    const ing   = ramp(unwrap(photos.left, 0.50, 0.238, 0.32, 0.55, 1024, 270, -180, 0), 90, 0);
    matchTo(fresh, front); matchTo(back, front); matchTo(ing, front);

    // paint in overlap order: back (base) → freshness → ingredients → front.
    // fresh sits on the jar's right half (φ 0…180), ing on the left half (φ −180…0,
    // wrapping past the 2048 seam), and the front oval overlaps both panel edges
    // exactly like the real label.
    ctx.drawImage(back, 1024, 0);
    ctx.drawImage(fresh, 512, 0);                      // φ 0…180 (jar's right)
    ctx.drawImage(ing, 0, 0, 512, H, 1536, 0, 512, H); // φ −180…−90 (jar's left, wraps past 2048)
    ctx.drawImage(ing, 512, 0, 512, H, 0, 0, 512, H);  // φ −90…0
    ctx.drawImage(front, 0, 0);                        // φ −90…90
  } else {
    // fallback: butter-coloured body with the procedural label band
    ctx.fillStyle = BRAND.peanut; ctx.fillRect(0, 0, W, H);
    const label = paintLabelTexture(null);
    ctx.drawImage(label, 0, H * 0.22, W, H * 0.56);
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  // rotate the wrap so the front photo faces the camera at scroll position 0
  tex.wrapS = T.RepeatWrapping;
  tex.offset.x = 0.25;
  return tex;
}

/* Studio gradient environment (softbox stripe for gold reflections) */
function paintEnvTexture() {
  const [c, ctx] = makeCanvas(512, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#FFF8EA'); g.addColorStop(0.45, '#EFE6D2');
  g.addColorStop(0.75, '#B09A78'); g.addColorStop(1, '#4A3620');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,.95)';      // key softbox
  ctx.fillRect(60, 30, 130, 60);
  ctx.fillStyle = 'rgba(255,225,160,.85)';      // warm rim light
  ctx.fillRect(360, 50, 100, 40);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.mapping = T.EquirectangularReflectionMapping;
  return tex;
}

/* Refined jar wrap — the pre-built seamless 360° texture: the four real photos
   re-projected onto true cylinder angles with the crisp label artwork composited
   on top (front medallion, ingredients wing, freshness wing, bare back). */
function loadBodyTexture() {
  const loader = new T.TextureLoader();
  return loader.loadAsync('assets/jar-wrap.jpg').then(tex => {
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.wrapS = T.RepeatWrapping;
    return tex;
  }).catch(() => null);
}

/* ============================================================
   BEAT TIMELINE (spec C2) — the single scrub-safe driver
   ============================================================ */
const KEYS = [
  { p: 0.00, cam: [0, 0.25, 7.4],  look: [0, 0.10, 0],     jarX: 0.00,  jarZ: 0,    lid: 0,   lidRot: 0,       peanuts: 0, rim: 0.9,  spin: 0.40 },
  { p: 0.14, cam: [1.25, 0.5, 5.7],look: [0.35, 0.15, 0],  jarX: 1.15,  jarZ: 0,    lid: 0,   lidRot: 0,       peanuts: 0, rim: 0.9,  spin: 0.30 },
  { p: 0.26, cam: [-0.2, 0.55, 5.5],look: [-0.35, 0.1, 0], jarX: -1.15, jarZ: 0,    lid: 0,   lidRot: 0,       peanuts: 0, rim: 0.9,  spin: 0.25 },
  { p: 0.42, cam: [0.65, 0.5, 5.4], look: [0.5, 1.35, 0],  jarX: 0.85,  jarZ: 0,    lid: 1.15,lidRot: 12.566,  peanuts: 0, rim: 1.1,  spin: 0.20 },
  { p: 0.57, cam: [-0.1, 0.35, 6.6],look: [-0.4, 0.05, 0], jarX: -1.15, jarZ: 0,    lid: 0,   lidRot: 0,       peanuts: 1, rim: 0.9,  spin: 0.25 },
  { p: 0.71, cam: [0.95, 0.2, 6.8],look: [0.35, 0, 0],     jarX: 1.05,  jarZ: 0,    lid: 0,   lidRot: 0,       peanuts: 0, rim: 0.9,  spin: 0.30 },
  { p: 0.83, cam: [0, 0.35, 9.2],  look: [0, 0.3, -1],     jarX: 0,     jarZ: -2.2, lid: 0,   lidRot: 0,       peanuts: 0, rim: 0.7,  spin: 0.25 },
  { p: 1.00, cam: [-0.35, 0.3, 6.6],look: [-0.35, 0.15, 0],jarX: -1.05, jarZ: 0,    lid: 0,   lidRot: 0,       peanuts: 0, rim: 2.2,  spin: 0.40 },
];

function sampleKeys(p) {
  p = clamp(p, 0, 1);
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = smooth(clamp((p - a.p) / Math.max(1e-5, b.p - a.p), 0, 1));
  const mix = (ka, kb) => lerp(ka, kb, t);
  return {
    cam: [mix(a.cam[0], b.cam[0]), mix(a.cam[1], b.cam[1]), mix(a.cam[2], b.cam[2])],
    look: [mix(a.look[0], b.look[0]), mix(a.look[1], b.look[1]), mix(a.look[2], b.look[2])],
    jarX: mix(a.jarX, b.jarX), jarZ: mix(a.jarZ, b.jarZ),
    lid: mix(a.lid, b.lid), lidRot: mix(a.lidRot, b.lidRot),
    peanuts: mix(a.peanuts, b.peanuts), rim: mix(a.rim, b.rim), spin: mix(a.spin, b.spin),
  };
}

/* Explorer window (drag enabled) & hotspot window — spec C2.1 / D6 */
const EXPLORER = [0.20, 0.40];
const HOTSPOT_WINDOW = [0.19, 0.42];
const inWindow = (p, w) => p >= w[0] && p <= w[1];

/* ============================================================
   SCENE
   ============================================================ */
async function initScene(THREE) {
  T = THREE; // bind namespace for texture painters
  const canvas = $('#stage');

  // preload the real jar photos (front / left / right / back) for realistic textures — spec A2.1
  const loadImg = src => new Promise((res, rej) => {
    const img = new Image();
    const to = setTimeout(() => rej(new Error('img timeout')), 6000);
    img.onload = () => { clearTimeout(to); res(img); };
    img.onerror = e => { clearTimeout(to); rej(e); };
    img.src = src;
  });
  const photos = { front: null, left: null, right: null, back: null };
  await Promise.all([
    ['front', 'assets/jar-photo.webp'], ['left', 'assets/jar-left.webp'],
    ['right', 'assets/jar-right.webp'], ['back', 'assets/jar-back.webp'],
  ].map(async ([k, src]) => { try { photos[k] = await loadImg(src); } catch { photos[k] = null; } }));

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  let DPR = Math.min(devicePixelRatio || 1, 2); // spec D7: hard DPR cap
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);

  /* environment for metals */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(paintEnvTexture()).texture;

  /* lights */
  scene.add(new THREE.AmbientLight(0xfff2e0, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(3, 4, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd98a, 0.9); rim.position.set(-4, 2, -3); scene.add(rim);

  /* ---- jar group ---- */
  const jar = new THREE.Group(); scene.add(jar);

  // jar body — ONE photo-textured cylinder. Preferred: the refined 360° wrap
  // (assets/jar-wrap.jpg) — real glass, real butter, crisp label artwork, baked
  // lighting. Fallback: on-the-fly photo unwrap / procedural label (old path).
  const refinedTex = await loadBodyTexture();
  const bodyTex = refinedTex || paintBodyTexture(photos);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 2.8, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: bodyTex, toneMapped: !refinedTex }) // unlit: the photo's own lighting IS the shading
  );
  jar.add(body);

  if (!refinedTex) {
    // butter disc just below the rim — reads as the open jar when the lid unscrews (Beat 4)
    const butterMat = new THREE.MeshStandardMaterial({ map: paintButterTexture(photos.back), roughness: 0.65, metalness: 0 });
    const openButter = new THREE.Mesh(new THREE.CircleGeometry(1.04, 64), butterMat);
    openButter.rotation.x = -Math.PI / 2; openButter.position.y = 1.06;
    jar.add(openButter);
    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(0.96, 0.96, 2.74, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: bodyTex, side: THREE.BackSide })
    );
    jar.add(innerWall);
  }

  // lid group (separate for unscrew animation, spec D2.3).
  // The refined wrap has the photo-real gold cap baked in, so the group stays
  // empty there; the procedural lid is only built for the fallback texture.
  const lid = new THREE.Group(); lid.position.y = 1.19; jar.add(lid);
  if (!refinedTex) {
    const goldMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.gold), metalness: 1, roughness: 0.32 });
    const lidBody = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.30, 64), goldMat);
    lid.add(lidBody);
    const lidRim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.028, 12, 64), goldMat);
    lidRim.rotation.x = Math.PI / 2; lidRim.position.y = 0.15; lid.add(lidRim);
    const sealTop = new THREE.Mesh(new THREE.CircleGeometry(1.1, 64), new THREE.MeshStandardMaterial({ map: paintSealTexture(), roughness: 0.55, metalness: 0.15 }));
    sealTop.rotation.x = -Math.PI / 2; sealTop.position.y = 0.153; lid.add(sealTop);
  } else {
    // close the top so the open cylinder never shows through from above
    const capTop = new THREE.Mesh(
      new THREE.CircleGeometry(0.99, 64),
      new THREE.MeshBasicMaterial({ color: 0xa8895a, toneMapped: false })
    );
    capTop.rotation.x = -Math.PI / 2; capTop.position.y = 2.792; jar.add(capTop);
  }

  // contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: paintShadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = refinedTex ? -1.39 : -1.22; jar.add(shadow);

  // orbiting peanut props (Beat 5)
  const peanutGroup = new THREE.Group(); scene.add(peanutGroup);
  const peanutMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.peanut), roughness: 0.7 });
  const peanuts = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 18), peanutMat);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 18), peanutMat);
    s1.position.y = 0.11; s2.position.y = -0.1; g.add(s1, s2);
    const a = i / 7 * Math.PI * 2;
    g.userData = { a, r: 1.9 + (i % 3) * 0.35, y: -0.6 + (i % 4) * 0.45, sp: 0.35 + (i % 3) * 0.12 };
    g.scale.setScalar(0.001); g.rotation.set(Math.random(), Math.random(), Math.random());
    peanutGroup.add(g); peanuts.push(g);
  }

  /* hotspots (spec D6) — anchors in jar-local space */
  const HOTSPOTS = [
    { pos: [0, 1.45, 0.6],  title: 'Brushed-Gold Lid',   body: 'Anodised gold screw-top with our embossed seal. Airtight, re-sealable, zero plastic.' },
    { pos: [0, -0.13, 1.02], title: 'The Label',          body: 'Slow-roasted peanuts with a touch of gurr shakar. That\u2019s the whole ingredient list \u2014 nothing artificial, ever.' },
    { pos: [-0.5, -0.62, 0.86], title: 'Glass Jar',    body: 'Thick reusable glass. Recycle it, refill it, or give it a second life as a brush jar.' },
  ];
  const hotspotEls = [];
  const hsList = $('#hotspots');
  HOTSPOTS.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = 'hotspot';
    li.innerHTML = `
      <button class="hotspot-dot" aria-expanded="false" aria-label="${h.title}">${i + 1}</button>
      <div class="hotspot-card" role="tooltip"><strong>${h.title}</strong>${h.body}</div>`;
    hsList.appendChild(li);
    hotspotEls.push({ el: li, anchor: new THREE.Vector3(...h.pos) });
    li.querySelector('.hotspot-dot').addEventListener('click', () => {
      const open = li.classList.toggle('open');
      li.querySelector('.hotspot-dot').setAttribute('aria-expanded', open);
      hotspotEls.forEach(o => { if (o.el !== li) o.el.classList.remove('open'); });
      track('hotspot_open', { id: h.title });
    });
  });

  /* ---------------- runtime state ---------------- */
  const state = {
    p: 0, userRot: 0, userVel: 0, dragging: false,
    auto: 0, wobble: 0, cur: { cam: [0, 0.25, 7.4], look: [0, 0.1, 0], jarX: 0, jarZ: 0, lid: 0, lidRot: 0, rim: 0.9, spin: 0.1 },
  };

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  /* scroll progress (spec D5: single normalized driver) */
  const readProgress = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? clamp(scrollY / max, 0, 1) : 0;
  };
  addEventListener('scroll', () => { state.p = readProgress(); }, { passive: true });
  state.p = readProgress();

  /* drag-to-rotate (spec C2.1) */
  let downX = 0, downY = 0, moved = false;
  addEventListener('pointerdown', e => {
    if (e.target.closest('a,button,input,#cart-drawer,#header,#footer,.beat-copy')) return;
    state.dragging = true; moved = false;
    downX = e.clientX; downY = e.clientY;
    state.userVel = 0;
  });
  addEventListener('pointermove', e => {
    if (!state.dragging) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (inWindow(state.p, EXPLORER) || state.p > 0.86) {
      state.userVel = dx * 0.006;
      state.userRot += state.userVel;
      downX = e.clientX; downY = e.clientY;
    }
  });
  addEventListener('pointerup', e => {
    if (state.dragging && !moved && state.wobble <= 0 && !prefersReduced) {
      state.wobble = 1; // easter-egg wobble, once per press (spec C2.1)
      track('jar_tap');
    }
    state.dragging = false;
  });

  /* ---------------- render loop ---------------- */
  const clock = new THREE.Clock();
  const V = new THREE.Vector3();
  let frames = 0, slowFrames = 0, degraded = false;
  const proj = v => {
    V.copy(v).project(camera);
    return { x: (V.x * 0.5 + 0.5) * 100, y: (-V.y * 0.5 + 0.5) * 100, behind: V.z > 1 };
  };

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const k = sampleKeys(state.p);
    const c = state.cur, ease = 1 - Math.pow(0.0018, dt); // frame-rate independent damping

    c.cam[0] = lerp(c.cam[0], k.cam[0], ease); c.cam[1] = lerp(c.cam[1], k.cam[1], ease); c.cam[2] = lerp(c.cam[2], k.cam[2], ease);
    c.look[0] = lerp(c.look[0], k.look[0], ease); c.look[1] = lerp(c.look[1], k.look[1], ease); c.look[2] = lerp(c.look[2], k.look[2], ease);
    c.jarX = lerp(c.jarX, k.jarX, ease); c.jarZ = lerp(c.jarZ, k.jarZ, ease);
    c.lid = lerp(c.lid, k.lid, ease); c.lidRot = lerp(c.lidRot, k.lidRot, ease);
    c.rim = lerp(c.rim, k.rim, ease); c.spin = lerp(c.spin, k.spin, ease);

    // pointer parallax (±3°, spec C2.1) — skipped for reduced-motion users
    const px = prefersReduced ? 0 : (pointer.x / innerWidth - 0.5) * 0.10;
    const py = prefersReduced ? 0 : (pointer.y / innerHeight - 0.5) * 0.06;

    camera.position.set(c.cam[0] + px, c.cam[1] + py, c.cam[2]);
    camera.lookAt(c.look[0], c.look[1], c.look[2]);

    // jar rotation: idle turntable + user drag
    if (!state.dragging && !inWindow(state.p, EXPLORER)) {
      state.userRot = lerp(state.userRot, Math.round(state.userRot / (Math.PI * 2)) * Math.PI * 2, 1 - Math.pow(0.2, dt));
    }
    state.auto += dt * c.spin * (prefersReduced ? 0.4 : 1);
    jar.rotation.y = state.auto + state.userRot;

    // jar transform
    jar.position.set(c.jarX, 0, c.jarZ);

    // wobble easter egg
    let wob = 1;
    if (state.wobble > 0.01) {
      wob = 1 + Math.sin(state.wobble * 14) * 0.035 * state.wobble;
      state.wobble = Math.max(0, state.wobble - dt * 1.8);
    }
    jar.scale.setScalar(wob);

    // lid unscrew
    lid.position.y = 1.31 + c.lid;
    lid.rotation.y = c.lidRot;

    // peanut orbit
    peanutGroup.rotation.y += dt * 0.25;
    peanuts.forEach(g => {
      g.userData.a += dt * g.userData.sp;
      g.position.set(Math.cos(g.userData.a) * g.userData.r, g.userData.y + Math.sin(state.auto + g.userData.a * 3) * 0.08, Math.sin(g.userData.a) * g.userData.r);
      const target = 0.9 * k.peanuts + 0.001;
      g.scale.setScalar(lerp(g.scale.x, target, 1 - Math.pow(0.01, dt)));
    });
    peanutGroup.position.x = c.jarX * 0.4;

    // rim light crescendo (Beat 8)
    rim.intensity = c.rim;

    // hotspot projection (spec D6)
    const live = inWindow(state.p, HOTSPOT_WINDOW);
    hsList.classList.toggle('live', live);
    if (live) {
      hotspotEls.forEach(({ el, anchor }) => {
        const s = proj(jar.localToWorld(anchor.clone()));
        el.style.left = s.x + '%'; el.style.top = s.y + '%';
        el.style.opacity = s.behind ? 0 : '';
      });
    }

    renderer.render(scene, camera);

    // lightweight debug hook (also used by QA, spec G1)
    if ((frames & 15) === 0) window.__pnt = { p: +state.p.toFixed(3), camZ: +camera.position.z.toFixed(2), rot: +(jar.rotation.y % 6.283).toFixed(2) };

    // runtime degrade (spec D7): sustained low FPS → drop transmission + DPR
    frames++;
    if (dt > 1 / 28) slowFrames++;
    if (!degraded && frames > 180 && slowFrames / frames > 0.5) {
      degraded = true;
      DPR = 1; renderer.setPixelRatio(1);
      track('perf_degrade');
    }
  }

  /* pointer parallax tracker */
  const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  tick();
  return { renderer };
}

/* ============================================================
   DOM: loader, beats, header, cart, newsletter
   ============================================================ */
function initLoader(onReady) {
  const loader = $('#loader'), fill = $('#loader-fill');
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 14 + 6, 92);
    fill.style.width = progress + '%';
  }, 160);
  const done = () => {
    clearInterval(timer);
    fill.style.width = '100%';
    setTimeout(() => {
      loader.classList.add('done');
      setTimeout(() => { loader.hidden = true; }, 700); // fully out of hit-testing flow
      onReady();
    }, 450);
  };
  // wait for the brand logo, then a beat, so the loader never flashes (spec H-01)
  const img = new Image();
  img.onload = () => setTimeout(done, 700);
  img.onerror = done;
  img.src = 'assets/mascot-logo.webp';
  setTimeout(done, 6000); // hard cap (spec H-01)
}

function initBeats() {
  const seen = new Set();
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const beat = en.target.dataset.beat;
      if (en.isIntersecting) {
        en.target.classList.add('active');
        if (!seen.has(beat)) { seen.add(beat); track('scene_beat_view', { beat }); }
      } else {
        en.target.classList.remove('active');
      }
    });
  }, { rootMargin: '-35% 0px -35% 0px' });
  $$('.beat').forEach(b => io.observe(b));
}

function initHeader() {
  const header = $('#header');
  addEventListener('scroll', () => header.classList.toggle('solid', scrollY > 40), { passive: true });
}

/* ---------------- Cart (spec E2) ---------------- */
const PRODUCT = { 'flagship-500g': { name: 'PEANUTOPIA 100% Natural', size: '500g glass jar', price: 2000, img: 'assets/jar-photo.webp' } };
const FREE_SHIP = 4000;   // free delivery from 2 jars (Rs 4,000)
const DELIVERY_FEE = 250; // COD delivery fee for orders under Rs 4,000
const ORDER_WHATSAPP = '923330388279'; // ← REPLACE with your WhatsApp number: country code + number, no + or spaces
const fmt = n => 'Rs ' + Math.round(n).toLocaleString('en-PK');

function initCart() {
  const KEY = 'peanutopia_cart_v1';
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch { items = []; }
  const save = () => localStorage.setItem(KEY, JSON.stringify(items));
  const drawer = $('#cart-drawer'), overlay = $('#cart-overlay');

  const subtotal = () => items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = () => items.reduce((s, i) => s + i.qty, 0);

  function render() {
    const badge = $('#cart-count'), n = count();
    badge.hidden = n === 0; badge.textContent = n;
    $('#cart-empty').hidden = items.length > 0;
    $('#cart-items').innerHTML = items.map((i, idx) => `
      <li>
        <img class="ci-thumb" src="${i.img}" alt="" />
        <span class="ci-name">${i.name}<small>${i.size}</small></span>
        <span class="ci-qty">
          <button data-dec="${idx}" aria-label="Decrease quantity">−</button>
          <span>${i.qty}</span>
          <button data-inc="${idx}" aria-label="Increase quantity">+</button>
        </span>
        <span class="ci-price">${fmt(i.price * i.qty)}</span>
      </li>`).join('');
    $('#cart-subtotal').textContent = fmt(subtotal());
    const pct = Math.min(100, subtotal() / FREE_SHIP * 100);
    $('#fs-fill').style.width = pct + '%';
    $('#fs-msg').textContent = subtotal() >= FREE_SHIP
      ? '🎉 Free delivery unlocked — anywhere in Karachi!'
      : `Add another jar (or ${fmt(FREE_SHIP - subtotal())} more) for FREE delivery`;
    save();
  }

  function open() { drawer.hidden = false; overlay.hidden = false; track('cart_open'); }
  function close() { drawer.hidden = true; overlay.hidden = true; }

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add-to-cart]');
    if (add) {
      const id = add.dataset.addToCart;
      const found = items.find(i => i.id === id);
      if (found) found.qty++; else items.push({ id, qty: 1, ...PRODUCT[id] });
      render();
      track('add_to_cart', { sku: id, source: add.dataset.source || 'page' });
      toast('Added to cart 🥜');
      const badge = $('#cart-count');
      badge.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300 });
    }
    if (e.target.closest('[data-inc]')) { items[+e.target.closest('[data-inc]').dataset.inc].qty++; render(); }
    if (e.target.closest('[data-dec]')) {
      const idx = +e.target.closest('[data-dec]').dataset.dec;
      items[idx].qty--; if (items[idx].qty <= 0) items.splice(idx, 1);
      render();
    }
    if (e.target.closest('#cart-btn')) open();
    if (e.target.closest('#cart-close') || e.target === overlay) close();
    if (e.target.closest('#checkout-btn')) openOrder();
    if (e.target.closest('[data-soon]')) { e.preventDefault(); toast('Coming soon — this shelf is still warming up.'); }
  });

  /* ---- COD order flow: form → WhatsApp message (Karachi cash on delivery) ---- */
  const orderOverlay = $('#order-overlay'), orderModal = $('#order-modal');
  const openOrder = () => {
    if (items.length === 0) { toast('Your cart is empty — add a jar first!'); return; }
    drawer.hidden = true; overlay.hidden = true;
    $('#order-items').innerHTML = items
      .map(i => `${i.qty} × ${i.name} (${i.size}) — ${fmt(i.price * i.qty)}`).join('<br>');
    const fee = subtotal() >= FREE_SHIP ? 0 : DELIVERY_FEE;
    $('#order-total').textContent = fmt(subtotal() + fee) + (fee ? ` (incl. ${fmt(DELIVERY_FEE)} delivery)` : ' (free delivery)');
    orderOverlay.hidden = false; orderModal.hidden = false;
    $('#of-name').focus();
    track('checkout_start');
  };
  const closeOrder = () => { orderOverlay.hidden = true; orderModal.hidden = true; };
  $('#order-close').addEventListener('click', closeOrder);
  orderOverlay.addEventListener('click', closeOrder);

  $('#order-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#of-name').value.trim();
    const phone = $('#of-phone').value.replace(/[^\d+]/g, '');
    const address = $('#of-address').value.trim();
    const notes = $('#of-notes').value.trim();
    if (name.length < 2) { toast('Please tell us your name.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { toast('Please add a valid phone number.'); return; }
    if (address.length < 8) { toast('Please add your full delivery address.'); return; }

    const fee = subtotal() >= FREE_SHIP ? 0 : DELIVERY_FEE;
    const lines = [
      '🥜 *PEANUTOPIA — New Order (COD)*',
      '',
      ...items.map(i => `• ${i.qty} × ${i.name} (${i.size}) — ${fmt(i.price * i.qty)}`),
      `Delivery: ${fee ? fmt(DELIVERY_FEE) : 'FREE'} (Karachi)`,
      `*Total: ${fmt(subtotal() + fee)}*`,
      '',
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Address: ${address}`,
    ];
    if (notes) lines.push(`Notes: ${notes}`);
    track('purchase', { value: subtotal() + fee, items: count() });
    window.open('https://wa.me/' + ORDER_WHATSAPP.replace(/\D/g, '') + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
    items = []; render(); closeOrder();
    toast('Order sent! We\'ll confirm on WhatsApp 🥜');
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); closeOrder(); } });

  render();
}

function initNewsletter() {
  $('#newsletter').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#nl-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('#nl-msg').textContent = 'Hmm, that email doesn\u2019t look right.';
      return;
    }
    $('#nl-msg').textContent = 'You\u2019re in! Welcome to the Fuel Club 🥜';
    track('newsletter_signup');
    e.target.reset();
  });
}

/* ---------------- Fallback mode (spec D8) ---------------- */
function enterFallback(reason) {
  document.body.classList.add('fallback');
  $('#poster').hidden = false;
  $('#loader').classList.add('done');
  $$('.beat').forEach(b => b.classList.add('active'));
  track('fallback_shown', { reason });
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/* ============================================================
   BOOT
   ============================================================ */
initCart();
initNewsletter();
initHeader();
initBeats();

const boot = async () => {
  // Reduced-motion phones still get the real 3D jar — motion is only toned
  // down (gentler spin, no parallax/wobble), never swapped for the flat poster.
  if (!webglOK()) { enterFallback('no-webgl'); return; }
  try {
    const THREE = await import('../vendor/three.module.js');
    await initScene(THREE);
    initLoader(() => track('scene_ready'));
  } catch (err) {
    console.error('3D init failed:', err);
    window.__pntError = (err && (err.stack || err.message)) || String(err);
    enterFallback(err.message || '3d-error');
  }
};
boot();




