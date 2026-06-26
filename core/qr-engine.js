/**
 * core/qr-engine.js — Smart QR Code Generator Engine
 * Client-side QR generation with styling, logo embedding, and vCard support.
 */

// ── QR Code Matrix Generator (ISO/IEC 18004) ──
const QREngine = (() => {
  'use strict';

  // ── GF(256) arithmetic for Reed-Solomon ──
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = (x << 1) ^ (x & 128 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) { return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }

  function rsGenPoly(nsym) {
    let g = [1];
    for (let i = 0; i < nsym; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= gfMul(g[j], GF_EXP[i]);
      }
      g = ng;
    }
    return g;
  }

  function rsEncode(data, nsym) {
    const gen = rsGenPoly(nsym);
    const out = new Uint8Array(data.length + nsym);
    out.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = out[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) out[i + j] ^= gfMul(gen[j], coef);
      }
    }
    out.set(data);
    return out;
  }

  // ── QR Constants ──
  const EC_CODEWORDS = [
    // [total, ec] per version, per level (L=0, M=1, Q=2, H=3)
    null,
    [[26,7],[26,10],[26,13],[26,17]],
    [[44,10],[44,16],[44,22],[44,28]],
    [[70,15],[70,26],[70,36],[70,44]],
    [[100,20],[100,36],[100,52],[100,64]],
    [[134,26],[134,48],[134,72],[134,88]],
    [[172,36],[172,64],[172,96],[172,112]],
    [[196,40],[196,72],[196,108],[196,130]],
    [[242,48],[242,88],[242,132],[242,156]],
    [[292,60],[292,110],[292,160],[292,192]],
    [[346,72],[346,130],[346,192],[346,224]],
    [[404,80],[404,150],[404,224],[404,264]],
    [[466,96],[466,176],[466,260],[466,308]],
    [[532,104],[532,198],[532,288],[532,352]],
    [[581,120],[581,216],[581,320],[581,384]],
    [[655,132],[655,240],[655,360],[655,432]],
    [[733,144],[733,280],[733,408],[733,480]],
    [[815,168],[815,308],[815,448],[815,532]],
    [[901,180],[901,338],[901,504],[901,588]],
    [[991,196],[991,364],[991,546],[991,650]],
    [[1085,224],[1085,416],[1085,600],[1085,700]],
    [[1156,224],[1156,442],[1156,644],[1156,750]],
    [[1258,252],[1258,476],[1258,690],[1258,816]],
    [[1364,270],[1364,504],[1364,750],[1364,900]],
    [[1474,300],[1474,560],[1474,810],[1474,960]],
    [[1588,312],[1588,588],[1588,870],[1588,1050]],
    [[1706,336],[1706,644],[1706,952],[1706,1110]],
    [[1828,360],[1828,700],[1828,1020],[1828,1200]],
    [[1921,390],[1921,728],[1921,1050],[1921,1260]],
    [[2051,420],[2051,784],[2051,1140],[2051,1350]],
    [[2185,450],[2185,812],[2185,1200],[2185,1440]],
    [[2323,480],[2323,868],[2323,1290],[2323,1530]],
    [[2465,510],[2465,924],[2465,1350],[2465,1620]],
    [[2611,540],[2611,980],[2611,1440],[2611,1710]],
    [[2761,570],[2761,1036],[2761,1530],[2761,1800]],
    [[2876,570],[2876,1064],[2876,1590],[2876,1890]],
    [[3034,600],[3034,1120],[3034,1680],[3034,1980]],
    [[3196,630],[3196,1204],[3196,1770],[3196,2100]],
    [[3362,660],[3362,1260],[3362,1860],[3362,2220]],
    [[3532,720],[3532,1316],[3532,1950],[3532,2310]],
    [[3706,750],[3706,1372],[3706,2040],[3706,2430]],
  ];

  const ALIGNMENT_POSITIONS = [
    null, [], [6,18], [6,22], [6,26], [6,30], [6,34],
    [6,22,38], [6,24,42], [6,26,46], [6,28,50], [6,30,54], [6,32,58],
    [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
    [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94],
    [6,26,50,74,98], [6,30,54,78,102], [6,28,54,80,106], [6,32,58,84,110],
    [6,30,58,86,114], [6,34,62,90,118], [6,26,50,74,98,122],
    [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134],
    [6,34,60,86,112,138], [6,30,58,86,114,142], [6,34,62,90,118,146],
    [6,30,54,78,102,126,150], [6,24,50,76,102,128,154],
    [6,28,54,80,106,132,158], [6,32,58,84,110,136,162],
    [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
  ];

  const MODE_BYTE = 4;
  const FORMAT_INFO_STRINGS = [
    [0x77c4,0x72f3,0x7daa,0x789d,0x662f,0x6318,0x6c41,0x6976,0x5412,0x5125,0x5e7c,0x5b4b,0x45f9,0x40ce,0x4f97,0x4aa0],
    [0x5fc5,0x5af2,0x55ab,0x509c,0x4e2e,0x4b19,0x4440,0x4177,0x7c13,0x7924,0x767d,0x734a,0x6df8,0x68cf,0x6796,0x62a1],
    [0x3a06,0x3f31,0x3068,0x355f,0x2bed,0x2eda,0x2183,0x24b4,0x19d0,0x1ce7,0x13be,0x1689,0x083b,0x0d0c,0x0255,0x0762],
    [0x1689,0x13be,0x1ce7,0x19d0,0x0762,0x0255,0x0d0c,0x083b,0x355f,0x3068,0x3f31,0x3a06,0x24b4,0x2183,0x2eda,0x2bed],
  ];

  const VERSION_INFO = [
    null,null,null,null,null,null,null,
    0x07C94,0x085BC,0x09A99,0x0A4D3,0x0BBF6,0x0C762,0x0D847,0x0E60D,0x0F928,
    0x10B78,0x1145D,0x12A17,0x13532,0x149A6,0x15683,0x168C9,0x177EC,0x18EC4,
    0x191E1,0x1AFAB,0x1B08E,0x1CC1A,0x1D33F,0x1ED75,0x1F250,0x209D5,0x216F0,
    0x228BA,0x2379F,0x24B0B,0x2542E,0x26A64,0x27541,0x28C69,
  ];

  function getMinVersion(dataLen, ecLevel) {
    for (let v = 1; v <= 40; v++) {
      const [total, ec] = EC_CODEWORDS[v][ecLevel];
      const dataCap = total - ec;
      const charCountBits = v <= 9 ? 8 : 16;
      const totalBits = 4 + charCountBits + dataLen * 8;
      const totalBytes = Math.ceil(totalBits / 8);
      if (totalBytes <= dataCap) return v;
    }
    return 40;
  }

  function encodeData(text, version, ecLevel) {
    const utf8 = new TextEncoder().encode(text);
    const charCountBits = version <= 9 ? 8 : 16;
    const [total, ecCount] = EC_CODEWORDS[version][ecLevel];
    const dataCap = total - ecCount;

    let bits = '';
    bits += '0100';
    bits += utf8.length.toString(2).padStart(charCountBits, '0');
    for (const b of utf8) bits += b.toString(2).padStart(8, '0');
    bits += '0000'.slice(0, Math.min(4, dataCap * 8 - bits.length));
    while (bits.length % 8 !== 0) bits += '0';

    const dataBytes = new Uint8Array(dataCap);
    let idx = 0;
    for (let i = 0; i < bits.length && idx < dataCap; i += 8) {
      dataBytes[idx++] = parseInt(bits.slice(i, i + 8), 2);
    }
    const pad = [0xEC, 0x11];
    for (let p = 0; idx < dataCap; idx++) dataBytes[idx] = pad[p++ % 2];

    return rsEncode(dataBytes, ecCount);
  }

  function createMatrix(version) {
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => new Int8Array(size));
    const reserved = Array.from({ length: size }, () => new Uint8Array(size));
    return { matrix, reserved, size };
  }

  function placeFinderPattern(m, r, reserved, row, col) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = row + dr, cc = col + dc;
        if (rr < 0 || rr >= m.length || cc < 0 || cc >= m.length) continue;
        reserved[rr][cc] = 1;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          const isEdge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          m[rr][cc] = (isEdge || isInner) ? 1 : 0;
        } else {
          m[rr][cc] = 0;
        }
      }
    }
  }

  function placeAlignmentPatterns(m, reserved, version) {
    const positions = ALIGNMENT_POSITIONS[version];
    if (!positions || positions.length === 0) return;
    for (const r of positions) {
      for (const c of positions) {
        if (reserved[r] && reserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= m.length || cc < 0 || cc >= m.length) continue;
            if (reserved[rr][cc]) continue;
            reserved[rr][cc] = 1;
            m[rr][cc] = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0;
          }
        }
      }
    }
  }

  function placeTimingPatterns(m, reserved) {
    const size = m.length;
    for (let i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) { m[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = 1; }
      if (!reserved[i][6]) { m[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = 1; }
    }
  }

  function reserveFormatInfo(reserved, size) {
    for (let i = 0; i < 8; i++) {
      reserved[8][i] = 1; reserved[8][size - 1 - i] = 1;
      reserved[i][8] = 1; reserved[size - 1 - i][8] = 1;
    }
    reserved[8][8] = 1;
    reserved[size - 8][8] = 1;
  }

  function reserveVersionInfo(reserved, size, version) {
    if (version < 7) return;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = 1;
        reserved[size - 11 + j][i] = 1;
      }
    }
  }

  function placeData(m, reserved, codewords) {
    const size = m.length;
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;
      const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
      for (const row of rows) {
        for (let dc = 0; dc <= 1; dc++) {
          const c = col - dc;
          if (c < 0 || reserved[row][c]) continue;
          const byteIdx = Math.floor(bitIdx / 8);
          const bitOff = 7 - (bitIdx % 8);
          if (byteIdx < codewords.length) {
            m[row][c] = (codewords[byteIdx] >> bitOff) & 1;
          }
          bitIdx++;
        }
      }
      upward = !upward;
    }
  }

  function applyMask(m, reserved, maskId) {
    const fns = [
      (r, c) => (r + c) % 2 === 0,
      (r, _) => r % 2 === 0,
      (_, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
      (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
    ];
    const fn = fns[maskId];
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m.length; c++) {
        if (!reserved[r][c] && fn(r, c)) m[r][c] ^= 1;
      }
    }
  }

  function placeFormatInfo(m, ecLevel, maskId) {
    const size = m.length;
    const bits = FORMAT_INFO_STRINGS[ecLevel][maskId];
    for (let i = 0; i < 15; i++) {
      const bit = (bits >> (14 - i)) & 1;
      if (i < 6) m[8][i] = bit;
      else if (i === 6) m[8][7] = bit;
      else if (i === 7) m[8][8] = bit;
      else m[14 - i][8] = bit;

      if (i < 8) m[size - 1 - i][8] = bit;
      else m[8][size - 15 + i] = bit;
    }
    m[size - 8][8] = 1;
  }

  function placeVersionInfo(m, version) {
    if (version < 7) return;
    const size = m.length;
    const info = VERSION_INFO[version];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const bit = (info >> (i * 3 + j)) & 1;
        m[i][size - 11 + j] = bit;
        m[size - 11 + j][i] = bit;
      }
    }
  }

  function scoreMask(m) {
    const size = m.length;
    let penalty = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { run++; }
        else { if (run >= 5) penalty += run - 2; run = 1; }
      }
      if (run >= 5) penalty += run - 2;
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { run++; }
        else { if (run >= 5) penalty += run - 2; run = 1; }
      }
      if (run >= 5) penalty += run - 2;
    }
    return penalty;
  }

  function generateMatrix(text, ecLevel = 1) {
    const utf8 = new TextEncoder().encode(text);
    const version = getMinVersion(utf8.length, ecLevel);
    const codewords = encodeData(text, version, ecLevel);
    const { matrix, reserved, size } = createMatrix(version);

    placeFinderPattern(matrix, reserved, reserved, 0, 0);
    placeFinderPattern(matrix, reserved, reserved, 0, size - 7);
    placeFinderPattern(matrix, reserved, reserved, size - 7, 0);
    placeAlignmentPatterns(matrix, reserved, version);
    placeTimingPatterns(matrix, reserved);
    reserveFormatInfo(reserved, size);
    reserveVersionInfo(reserved, size, version);
    placeData(matrix, reserved, codewords);

    let bestMask = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const copy = matrix.map(row => Int8Array.from(row));
      applyMask(copy, reserved, mask);
      placeFormatInfo(copy, ecLevel, mask);
      placeVersionInfo(copy, version);
      const score = scoreMask(copy);
      if (score < bestScore) { bestScore = score; bestMask = mask; }
    }

    applyMask(matrix, reserved, bestMask);
    placeFormatInfo(matrix, ecLevel, bestMask);
    placeVersionInfo(matrix, version);

    return { matrix, size, version };
  }

  // ── Canvas Rendering ──

  function renderToCanvas(canvas, matrix, options = {}) {
    const {
      size: canvasSize = 1024,
      moduleStyle = 'rounded',
      fgColor = '#1a1a2e',
      bgColor = '#ffffff',
      gradient = null,
      logoImg = null,
      logoSize = 0.22,
      quietZone = 2,
      cornerRadius = 0.45,
    } = options;

    const matSize = matrix.length;
    const totalModules = matSize + quietZone * 2;
    const moduleSize = canvasSize / totalModules;

    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    let fillStyle;
    if (gradient) {
      const grd = gradient.type === 'radial'
        ? ctx.createRadialGradient(canvasSize / 2, canvasSize / 2, 0, canvasSize / 2, canvasSize / 2, canvasSize / 2)
        : ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
      grd.addColorStop(0, gradient.from);
      grd.addColorStop(1, gradient.to);
      fillStyle = grd;
    } else {
      fillStyle = fgColor;
    }

    const isFinderModule = (r, c) => {
      return (r < 7 && c < 7) || (r < 7 && c >= matSize - 7) || (r >= matSize - 7 && c < 7);
    };

    const isFinderCenter = (r, c) => {
      return (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
             (r >= 2 && r <= 4 && c >= matSize - 5 && c <= matSize - 3) ||
             (r >= matSize - 5 && r <= matSize - 3 && c >= 2 && c <= 4);
    };

    ctx.fillStyle = fillStyle;

    for (let r = 0; r < matSize; r++) {
      for (let c = 0; c < matSize; c++) {
        if (!matrix[r][c]) continue;

        const x = (c + quietZone) * moduleSize;
        const y = (r + quietZone) * moduleSize;
        const s = moduleSize;

        if (isFinderModule(r, c)) {
          if (isFinderCenter(r, c)) {
            const rad = s * 0.35;
            ctx.beginPath();
            ctx.roundRect(x + s * 0.05, y + s * 0.05, s * 0.9, s * 0.9, rad);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, s, s);
          }
          continue;
        }

        if (moduleStyle === 'dots') {
          ctx.beginPath();
          ctx.arc(x + s / 2, y + s / 2, s * 0.38, 0, Math.PI * 2);
          ctx.fill();
        } else if (moduleStyle === 'rounded') {
          const rad = s * cornerRadius;
          ctx.beginPath();
          ctx.roundRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, rad);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, s, s);
        }
      }
    }

    if (logoImg) {
      const logoW = canvasSize * logoSize;
      const logoH = canvasSize * logoSize;
      const lx = (canvasSize - logoW) / 2;
      const ly = (canvasSize - logoH) / 2;
      const pad = logoW * 0.12;

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(lx - pad, ly - pad, logoW + pad * 2, logoH + pad * 2, pad * 0.8);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(lx, ly, logoW, logoH, pad * 0.6);
      ctx.clip();
      ctx.drawImage(logoImg, lx, ly, logoW, logoH);
      ctx.restore();
    }

    return canvas;
  }

  // ── vCard Builder ──
  function buildVCard(info) {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
    ];
    if (info.name) lines.push(`FN:${info.name}`);
    if (info.name) {
      const parts = info.name.trim().split(/\s+/);
      const last = parts.length > 1 ? parts.pop() : '';
      const first = parts.join(' ');
      lines.push(`N:${last};${first};;;`);
    }
    if (info.company) lines.push(`ORG:${info.company}`);
    if (info.title) lines.push(`TITLE:${info.title}`);
    if (info.phone) lines.push(`TEL;TYPE=CELL:${info.phone}`);
    if (info.phone2) lines.push(`TEL;TYPE=WORK:${info.phone2}`);
    if (info.whatsapp) lines.push(`TEL;TYPE=MSG:${info.whatsapp}`);
    if (info.email) lines.push(`EMAIL:${info.email}`);
    if (info.website) lines.push(`URL:${info.website}`);
    if (info.address) lines.push(`ADR;TYPE=WORK:;;${info.address};;;;`);
    if (info.facebook) lines.push(`X-SOCIALPROFILE;TYPE=facebook:${info.facebook}`);
    if (info.instagram) lines.push(`X-SOCIALPROFILE;TYPE=instagram:${info.instagram}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  // ── WiFi String Builder ──
  function buildWiFi(info) {
    const enc = info.encryption || 'WPA';
    const hidden = info.hidden ? 'H:true' : '';
    return `WIFI:T:${enc};S:${info.ssid || ''};P:${info.password || ''};${hidden};`;
  }

  // ── Public API ──
  return {
    generate(text, ecLevel = 1) {
      return generateMatrix(text, ecLevel);
    },

    render(canvas, text, options = {}) {
      const ecLevel = options.ecLevel ?? (options.logoImg ? 3 : 1);
      const { matrix } = generateMatrix(text, ecLevel);
      return renderToCanvas(canvas, matrix, options);
    },

    buildVCard,
    buildWiFi,

    EC_LEVELS: { L: 0, M: 1, Q: 2, H: 3 },
    MODULE_STYLES: ['square', 'rounded', 'dots'],

    async loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('فشل تحميل الصورة'));
        img.src = src;
      });
    },

    exportPNG(canvas, filename = 'qr-code.png', quality = 1.0) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png', quality);
      document.body.appendChild(link);
      link.click();
      link.remove();
    },

    exportSVG(matrix, options = {}) {
      const {
        moduleStyle = 'rounded',
        fgColor = '#1a1a2e',
        bgColor = '#ffffff',
        quietZone = 2,
      } = options;

      const matSize = matrix.length;
      const totalModules = matSize + quietZone * 2;
      const moduleSize = 10;
      const svgSize = totalModules * moduleSize;

      let paths = '';
      for (let r = 0; r < matSize; r++) {
        for (let c = 0; c < matSize; c++) {
          if (!matrix[r][c]) continue;
          const x = (c + quietZone) * moduleSize;
          const y = (r + quietZone) * moduleSize;
          if (moduleStyle === 'dots') {
            const cx = x + moduleSize / 2;
            const cy = y + moduleSize / 2;
            const radius = moduleSize * 0.38;
            paths += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fgColor}"/>`;
          } else if (moduleStyle === 'rounded') {
            const s = moduleSize * 0.84;
            const off = moduleSize * 0.08;
            const rad = moduleSize * 0.35;
            paths += `<rect x="${x + off}" y="${y + off}" width="${s}" height="${s}" rx="${rad}" fill="${fgColor}"/>`;
          } else {
            paths += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${fgColor}"/>`;
          }
        }
      }

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">
<rect width="${svgSize}" height="${svgSize}" fill="${bgColor}"/>
${paths}
</svg>`;
    },
  };
})();

if (typeof window !== 'undefined') window.QREngine = QREngine;
export default QREngine;
