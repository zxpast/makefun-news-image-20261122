// makefun-news-image-20261122 — REBUILD (R2)
// "The World in One Page — Sunday 22 November 2026"
// A broadsheet front page drawn in pure Node.js standard library:
// own PNG encoder, own single-stroke vector font, no network, no
// dependencies, deterministic — two runs write byte-identical PNGs.
//
// Every story here happened, or was first reported, on Sunday
// 22 November 2026, in some time zone. Stories that broke on other
// days are listed in the DATE CHECK box, not on the page.
// Sources: Reuters, AP, AFP, BBC, Al Jazeera, UN News, ATP Tour.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ------------------------------------------------------------------
// PNG encoder (RGB, 8-bit, no ancillary chunks, deterministic)
// ------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // One scanline per row, filter byte 0 (None) + raw RGB triples.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------
// Canvas: an RGB buffer with small flat-drawing primitives
// ------------------------------------------------------------------
const W = 1024;
const H = 1024;

const PAPER = [247, 242, 231];
const INK = [26, 26, 26];
const RED = [185, 28, 28];
const NAVY = [30, 58, 95];
const BLUE = [37, 99, 235];
const GREEN = [22, 101, 52];
const GOLD = [176, 124, 24];
const GREY = [110, 108, 100];
const LIGHT = [233, 227, 214];
const PANEL = [238, 232, 219];
const TEAL = [13, 115, 119];
const WHITE = [255, 255, 255];
const SKY = [186, 214, 235];
const SAND = [214, 196, 160];
const SEA = [168, 196, 214];

class Canvas {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.buf[i * 3] = bg[0];
      this.buf[i * 3 + 1] = bg[1];
      this.buf[i * 3 + 2] = bg[2];
    }
  }
  px(x, y, c) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const o = (yi * this.w + xi) * 3;
    this.buf[o] = c[0];
    this.buf[o + 1] = c[1];
    this.buf[o + 2] = c[2];
  }
  rect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * this.w + xx) * 3;
        this.buf[o] = c[0];
        this.buf[o + 1] = c[1];
        this.buf[o + 2] = c[2];
      }
    }
  }
  frame(x, y, w, h, c, t) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  hline(x, y, len, c, t) {
    this.rect(x, y - Math.floor(t / 2), len, t, c);
  }
  vline(x, y, len, c, t) {
    this.rect(x - Math.floor(t / 2), y, t, len, c);
  }
  // Thick line: stamp small squares along the segment.
  line(x0, y0, x1, y1, c, t) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const r = Math.max(1, Math.round(t / 2));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (dx * i) / steps;
      const y = y0 + (dy * i) / steps;
      this.rect(x - r + 1, y - r + 1, 2 * r - 1, 2 * r - 1, c);
    }
  }
  polyline(pts, c, t) {
    for (let i = 0; i + 1 < pts.length; i++) {
      this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, t);
    }
  }
  circle(x, y, r, c, t) {
    const steps = Math.max(24, Math.round(2 * Math.PI * r));
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const a = (2 * Math.PI * i) / steps;
      const p = [x + r * Math.cos(a), y + r * Math.sin(a)];
      if (prev) this.line(prev[0], prev[1], p[0], p[1], c, t);
      prev = p;
    }
  }
  fillCircle(x, y, r, c) {
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      this.rect(x - dx, y + dy, 2 * dx + 1, 1, c);
    }
  }
  // Scanline polygon fill (pts: [[x,y],...], non self-intersecting).
  fillPoly(pts, c) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const x = a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
          xs.push(x);
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        this.rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, c);
      }
    }
  }
  // Filled triangle helper.
  tri(x0, y0, x1, y1, x2, y2, c) {
    this.fillPoly([[x0, y0], [x1, y1], [x2, y2]], c);
  }
}

// ------------------------------------------------------------------
// Single-stroke vector font.
// Glyphs live on a 5-wide x 7-tall grid (x 0..4, y 0..6, baseline 6;
// descenders reach y 7). One glyph = list of polylines; each polyline
// is drawn as one unbroken stroke. All text is set in capitals.
// Digit "9" is a closed loop with a tail down the right side — it
// rendered as "o"/"a" in the news-21 font, so it is unit-tested here
// (see the digit gate: render 0123456789 at full size and at 300px).
// ------------------------------------------------------------------
// Single-stroke vector font on a 5x7 grid (advance 6 units).
// Thin strokes (t = round(s*0.3)): the version of this font that
// passed the full-size OCR gate on hero titles (0-3.6% CER).
// Digits fixed for OCR: 0 = plain loop (no slash), 2 = two-segment
// diagonal, 6 = top hook + middle bar, 9 = closed loop + tail.
// Single-stroke vector font on a 5x7 grid (advance 6 units).
// Thin strokes (t = round(s*0.3)): the version of this font that
// passed the full-size OCR gate on hero titles (0-3.6% CER).
// Digits fixed for OCR: 0 = plain loop (no slash), 2 = two-segment
// diagonal, 6 = top hook + middle bar, 9 = closed loop + tail.
// Single-stroke vector font on a 5x7 grid (advance 6 units).
// Thin strokes (t = round(s*0.3)): the version of this font that
// passed the full-size OCR gate on hero titles (0-3.6% CER).
// Digits fixed for OCR: 0 = plain loop (no slash), 2 = two-segment
// diagonal, 6 = top hook + middle bar, 9 = closed loop + tail.
// Single-stroke vector font on a 5x7 grid (advance 6 units).
// Thin strokes (t = round(s*0.3)): the version of this font that
// passed the full-size OCR gate on hero titles (0-3.6% CER).
// Digits fixed for OCR: 0 = plain loop (no slash), 2 = two-segment
// diagonal, 6 = top hook + middle bar, 9 = closed loop + tail.
const GLYPHS: Record<string, number[][][]> = {
  " ": [],
  "!": [[[2, 0], [2, 4]], [[2, 6]]],
  "\"": [[[1, 0], [1, 2]], [[3, 0], [3, 2]]],
  "$": [[[2, 0], [2, 6]], [[0, 1], [4, 1]], [[0, 3], [4, 3]], [[0, 5], [4, 5]]],
  "%": [[[0, 0], [1, 0], [1, 1], [0, 1]], [[3, 5], [4, 5], [4, 6], [3, 6]], [[0, 6], [4, 0]]],
  "&": [[[3, 0], [2, 0], [1, 1], [1, 2], [2, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [2, 3]]],
  "'": [[[2, 0], [2, 2]]],
  "(": [[[3, 0], [2, 1], [1, 2], [1, 4], [2, 5], [3, 6]]],
  ")": [[[1, 0], [2, 1], [3, 2], [3, 4], [2, 5], [1, 6]]],
  "*": [[[2, 0], [2, 6]], [[0, 2], [4, 4]], [[4, 2], [0, 4]]],
  "+": [[[2, 1], [2, 5]], [[0, 3], [4, 3]]],
  ",": [[[2, 5], [2, 6], [1, 6]]],
  "-": [[[0, 3], [4, 3]]],
  ".": [[[2, 6]]],
  "/": [[[4, 0], [0, 6]]],
  "0": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  "1": [[[1, 0], [2, 0], [2, 6]], [[0, 6], [4, 6]]],
  "2": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 4], [0, 6], [4, 6]]],
  "3": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  "4": [[[3, 0], [0, 3], [4, 3]], [[3, 0], [3, 6]]],
  "5": [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  "6": [[[3, 0], [2, 0], [1, 1], [0, 2], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [3, 2], [1, 2]]],
  "7": [[[0, 0], [4, 0], [1, 6]]],
  "8": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[0, 3], [4, 3]]],
  "9": [[[1, 0], [3, 0], [4, 1], [4, 3], [3, 4], [1, 4], [0, 3], [0, 1], [1, 0]], [[3, 4], [4, 6]]],
  ":": [[[2, 1], [2, 2]], [[2, 4], [2, 5]]],
  ";": [[[2, 1], [2, 2]], [[2, 4], [2, 5], [1, 6]]],
  "<": [[[4, 1], [1, 3], [4, 5]]],
  "=": [[[0, 2], [4, 2]], [[0, 4], [4, 4]]],
  ">": [[[0, 1], [3, 3], [0, 5]]],
  "?": [[[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3]], [[2, 5], [2, 6]]],
  "A": [[[0, 6], [2, 0], [4, 6]], [[1, 4], [3, 4]]],
  "B": [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  "C": [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  "D": [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 5], [3, 6], [0, 6]]],
  "E": [[[0, 0], [0, 6]], [[0, 0], [4, 0]], [[0, 3], [3, 3]], [[0, 6], [4, 6]]],
  "F": [[[0, 0], [0, 6]], [[0, 0], [4, 0]], [[0, 3], [3, 3]]],
  "G": [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3]], [[4, 3], [3, 3]]],
  "H": [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  "I": [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
  "J": [[[2, 0], [4, 0]], [[3, 0], [3, 5], [2, 6], [1, 6], [0, 5]]],
  "K": [[[0, 0], [0, 6]], [[4, 0], [0, 3], [4, 6]]],
  "L": [[[0, 0], [0, 6]], [[0, 6], [4, 6]]],
  "M": [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  "N": [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  "O": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  "P": [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  "Q": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[3, 4], [4, 6]]],
  "R": [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
  "S": [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  "T": [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  "U": [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  "V": [[[0, 0], [2, 6], [4, 0]]],
  "W": [[[0, 0], [1, 6], [2, 3], [3, 6], [4, 0]]],
  "X": [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  "Y": [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  "Z": [[[0, 0], [4, 0], [2, 3], [0, 6], [4, 6]]],
  "[": [[[3, 0], [1, 0], [1, 6], [3, 6]]],
  "]": [[[1, 0], [3, 0], [3, 6], [1, 6]]],
  "_": [[[0, 6], [4, 6]]],
  "\u00b0": [[[1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [1, 1], [2, 0]]],
  "\u2013": [[[0, 3], [4, 3]]],
  "\u2014": [[[0, 3], [4, 3]]],
  "\u2022": [[[2, 3]]],
};

const ADVANCE = 6; // grid units per character (5 + 1 spacing)

// Draw one glyph with its top-left at (x, y); s = pixels per grid unit.
function drawGlyph(cv: Canvas, ch: string, x: number, y: number, s: number, color: [number, number, number]) {
  const g = GLYPHS[ch.toUpperCase()];
  if (!g) return;
  // Stroke weight: key lines (s>=3) get t=2 — solid enough for Tesseract
  // to follow curves/diagonals; small text keeps thin t=1 strokes so
  // dense lines do not merge. (t=1 at s=3.5 left C/P/3/1/M misread.)
  const t = s >= 3 ? 2 : Math.max(1, Math.round(s * 0.3));
  for (const stroke of g) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) {
      // single-point stroke (bullet, period): a t x t square
      cv.rect(Math.round(x + stroke[0][0] * s - t / 2), Math.round(y + stroke[0][1] * s - t / 2), t, t, color);
      continue;
    }
    const pts = stroke.map(([gx, gy]) => [Math.round(x + gx * s), Math.round(y + gy * s)] as [number, number]);
    cv.polyline(pts, color, t);
  }
}

function textWidth(str, s) {
  return str.length * ADVANCE * s - s;
}

function drawText(cv, str, x, y, s, c, align) {
  const w = textWidth(str, s);
  let x0 = x;
  if (align === "center") x0 = x - w / 2;
  if (align === "right") x0 = x - w;
  for (let i = 0; i < str.length; i++) {
    drawGlyph(cv, str[i], x0 + i * ADVANCE * s, y, s, c);
  }
  return w;
}

// Greedy word wrap; returns lines that fit maxWidth at scale s.
function wrapText(str, s, maxWidth) {
  const words = str.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, s) <= maxWidth || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw text centred in a box, wrapping to at most maxLines lines.
function drawTextBox(cv, str, x, y, w, s, c, maxLines, lineH) {
  const lines = wrapText(str, s, w).slice(0, maxLines);
  for (let i = 0; i < lines.length; i++) {
    drawText(cv, lines[i], x + w / 2, y + i * lineH, s, c, "center");
  }
  return lines.length;
}

// ------------------------------------------------------------------
// Story data — all first reported on Sunday 22 November 2026.
// Verified against live wires at build time (Reuters / AP / AFP /
// BBC / Al Jazeera / UN News / ATP Tour). Region tags are fixed here
// (Zecler = France, Miliband = UK/EU) and the region strip below is
// COUNTED from this data, never typed by hand.
// ------------------------------------------------------------------
const HEROES = [
  {
    n: 1, place: "JOHANNESBURG", beat: "SUMMIT", region: "AFRICA",
    head: ["G20 OPENS IN", "AFRICA"],
    body: ["RAMAPHOSA HOSTS", "42 NATIONS. REU"],
    src: "REUTERS", art: "g20",
  },
  {
    n: 2, place: "ANTALYA", beat: "CLIMATE", region: "EUROPE",
    head: ["COP31 COLLAPSES", "WITH NO DEAL"],
    body: ["LONGEST SUMMIT", "EVER. UN NEWS"],
    src: "UN NEWS", art: "cop31",
  },
  {
    n: 3, place: "RIYADH", beat: "GULF", region: "MIDDLE EAST",
    head: ["MISSILES OVER", "RIYADH AGAIN"],
    body: ["SAUDI DOWNS", "HOUTHI FIRE. AJZ"],
    src: "AL JAZEERA", art: "gulf",
  },
];

const CARDS = [
  { n: 4, place: "WELLINGTON", beat: "SPORT", region: "OCEANIA",
    head: ["PANT HITS", "128"], src: "AP", art: "cricket" },
  { n: 5, place: "JOHANNESBURG", beat: "DIPLOMACY", region: "EUROPE",
    head: ["EU FIGHTS", "FOR PEACE"], src: "BBC", art: "flags" },
  { n: 6, place: "BALTIC", beat: "WAR", region: "EUROPE",
    head: ["SHIP ON", "FIRE"], src: "BBC", art: "ship" },
  { n: 7, place: "CIKANDE", beat: "DISASTER", region: "ASIA",
    head: ["3 DEAD", "36 LOST"], src: "BBC", art: "flame" },
  { n: 8, place: "SEOUL", beat: "POLITICS", region: "ASIA",
    head: ["MINISTER", "QUITS"], src: "BBC", art: "ballot" },
  { n: 9, place: "WASHINGTON", beat: "SECURITY", region: "AMERICAS",
    head: ["FBI PROBE", "OWN HACK"], src: "BBC", art: "magnifier" },
  { n: 10, place: "LAS VEGAS", beat: "SPORT", region: "AMERICAS",
    head: ["MAX WINS", "IN VEGAS"], src: "BBC", art: "car" },
  { n: 11, place: "TURIN", beat: "SPORT", region: "EUROPE",
    head: ["FRENCH", "WIN TITLE"], src: "ATP", art: "racket" },
  { n: 12, place: "WEST BANK", beat: "CONFLICT", region: "MIDDLE EAST",
    head: ["EISENKOT", "CONDEMNS"], src: "REUTERS", art: "wall" },
  { n: 13, place: "WASHINGTON", beat: "POLITICS", region: "AMERICAS",
    head: ["PUTIN: NO", "FRIEND"], src: "REUTERS", art: "podium" },
];

// Briefs 14-37. Headline part ("NN PLACE HEAD") is kept to 24 chars
// at tight tracking so the named source still fits on the same line.
const BRIEFS = [
  { n: 14, place: "TURIN", head: "Zverev-Alcaraz", src: "ATP", region: "EUROPE" },
  { n: 15, place: "GURGL", head: "Haugan wins", src: "REU", region: "EUROPE" },
  { n: 16, place: "US SENATE", head: "Vote", src: "REU", region: "AMERICAS" },
  { n: 17, place: "ROME", head: "Bulgari dies 89", src: "BBC", region: "EUROPE" },
  { n: 18, place: "CALIF.", head: "Biggest waves", src: "GDN", region: "AMERICAS" },
  { n: 19, place: "CARACAS", head: "US deal", src: "BBC", region: "AMERICAS" },
  { n: 20, place: "JOBURG", head: "ANC fights", src: "BBC", region: "AFRICA" },
  { n: 21, place: "ZAGREB", head: "Patient dies", src: "AJZ", region: "EUROPE" },
  { n: 22, place: "LONDON", head: "Tuition row", src: "BBC", region: "EUROPE" },
  { n: 23, place: "PARIS", head: "Zecler verdict", src: "BBC", region: "EUROPE" },
  { n: 24, place: "OSLO", head: "Tree felled", src: "BBC", region: "EUROPE" },
  { n: 25, place: "USA", head: "Gamer rescue", src: "BBC", region: "AMERICAS" },
  { n: 26, place: "GAZA", head: "Army out", src: "BBC", region: "MIDDLE EAST" },
  { n: 27, place: "LONDON", head: "Jet warning", src: "BBC", region: "EUROPE" },
  { n: 28, place: "LONDON", head: "England win", src: "BBC", region: "EUROPE" },
  { n: 29, place: "CARDIFF", head: "Wales lose", src: "BBC", region: "EUROPE" },
  { n: 30, place: "USA", head: "UFO files out", src: "BBC", region: "AMERICAS" },
  { n: 31, place: "LONDON", head: "TV apology", src: "BBC", region: "EUROPE" },
  { n: 32, place: "ASIA", head: "Pet scandal", src: "BBC", region: "ASIA" },
  { n: 33, place: "USA", head: "Hair sells $4K", src: "BBC", region: "AMERICAS" },
  { n: 34, place: "BERLIN", head: "Drone tests", src: "BBC", region: "EUROPE" },
  { n: 35, place: "KYIV", head: "Crews at work", src: "BBC", region: "EUROPE" },
  { n: 36, place: "NIGERIA", head: "Youth shun", src: "BBC", region: "AFRICA" },
  { n: 37, place: "ANFIELD", head: "Pochettino", src: "GDN", region: "EUROPE" },
];

const STATS = [
  { num: "20", label: ["G20 SUMMIT", "FIRST AFRICA"] },
  { num: "44", label: ["HOURS LATE", "NO DEAL"] },
  { num: "128", label: ["PANT RUNS", "INDIA 720-9"] },
  { num: "720", label: ["INDIA TOTAL", "WELLINGTON"] },
  { num: "36", label: ["MISSING IN", "CIKANDE FIRE"] },
  { num: "1.5°", label: ["C LIMIT WILL", "BE PASSED"] },
];

// Stories that broke on other days — listed here, NOT on the page.
const DATECHECK_HEAD = "LEFT OUT ON PURPOSE - THEY BROKE ON OTHER DAYS:";
const DATECHECK = [
  "PERU QUAKE 20 NOV • ZELENSKYY KYIV 21 NOV",
  "POLAND MISSILE 20 NOV • OMAN TANKERS 21 NOV",
  "KYIV DRONES 20 NOV • GUPTA 20 NOV • PALISADES 20 NOV",
  "ROUNDUP 20 NOV • MANILA 21 NOV • SHENZHEN 19 NOV",
  "ICJ RULING 19 NOV • EL CHAPO 21 NOV • BOAT CAPSIZE 21 NOV",
];

// Region counts, computed from the story data (never typed by hand).
const REGION_ORDER = ["AFRICA", "EUROPE", "MIDDLE EAST", "ASIA", "AMERICAS", "OCEANIA", "GLOBAL"];
function regionCounts() {
  const counts = {};
  for (const r of REGION_ORDER) counts[r] = 0;
  for (const s of [...HEROES, ...CARDS, ...BRIEFS]) counts[s.region]++;
  return counts;
}
const TOTAL_STORIES = HEROES.length + CARDS.length + BRIEFS.length;

// Map pins 1-13 (lat, lon) for the illustrated stories.
const PINS = [
  [-26.2, 28.0], [37.0, 30.7], [24.7, 46.7], [-41.3, 174.8],
  [50.4, 30.5], [60.0, 27.0], [-6.2, 106.3], [37.5, 127.0],
  [38.9, -77.0], [36.2, -115.1], [45.1, 7.7], [32.0, 35.2],
  [38.9, -77.0],
];

// ------------------------------------------------------------------
// Text with custom tracking (used for the brief list, where the
// source code must still fit on the same line as the headline).
// ------------------------------------------------------------------
function textWidthAdv(str, s, adv) {
  return str.length * adv * s - s;
}

function drawTextAdv(cv, str, x, y, s, c, adv) {
  for (let i = 0; i < str.length; i++) {
    drawGlyph(cv, str[i], x + i * adv * s, y, s, c);
  }
}

// ------------------------------------------------------------------
// Illustrations (flat, high-contrast, no photorealism)
// ------------------------------------------------------------------
function drawPerson(cv, cx, y, scale, shirt, skin) {
  cv.fillCircle(cx, y + 6 * scale, 5 * scale, skin);
  cv.fillPoly(
    [[cx - 13 * scale, y + 26 * scale], [cx + 13 * scale, y + 26 * scale],
     [cx + 18 * scale, y + 12 * scale], [cx - 18 * scale, y + 12 * scale]],
    shirt,
  );
  // tie
  cv.fillPoly(
    [[cx - 2 * scale, y + 13 * scale], [cx + 2 * scale, y + 13 * scale],
     [cx + 3 * scale, y + 24 * scale], [cx - 3 * scale, y + 24 * scale]],
    RED,
  );
}

function drawG20(cv, x, y, w, h) {
  // Three flags behind the table, three leaders, name plates below.
  const fw = 62;
  const flagY = y + 2;
  const fx = [x + 18, x + w / 2 - fw / 2, x + w - 18 - fw];
  // South Africa (green + gold Y, simplified to bands)
  cv.rect(fx[0], flagY, fw, 16, GREEN);
  cv.rect(fx[0], flagY + 6, fw, 4, GOLD);
  // India (saffron / white / green)
  cv.rect(fx[1], flagY, fw, 5, [255, 153, 51]);
  cv.rect(fx[1], flagY + 5, fw, 6, WHITE);
  cv.rect(fx[1], flagY + 11, fw, 5, GREEN);
  // France (blue / white / red)
  cv.rect(fx[2], flagY, fw / 3, 16, BLUE);
  cv.rect(fx[2] + fw / 3, flagY, fw / 3, 16, WHITE);
  cv.rect(fx[2] + (2 * fw) / 3, flagY, fw / 3, 16, RED);
  // Leaders behind the table.
  const cy = [x + 49, x + w / 2, x + w - 49];
  drawPerson(cv, cy[0], y + 16, 1, NAVY, [222, 184, 150]);
  drawPerson(cv, cy[1], y + 16, 1, INK, [210, 170, 135]);
  drawPerson(cv, cy[2], y + 16, 1, NAVY, [225, 190, 158]);
  // Table.
  cv.rect(x + 8, y + 40, w - 16, 4, [120, 84, 50]);
  cv.rect(x + 8, y + 44, w - 16, 2, [90, 62, 36]);
  // Name plates.
  drawText(cv, "RAMAPHOSA • MODI • MACRON", x + w / 2, y + 48, 2, INK, "center");
}

function drawCOP31(cv, x, y, w, h) {
  const cx = x + w / 2 - 30;
  const cy = y + 28;
  // Globe.
  cv.fillCircle(cx, cy, 24, SEA);
  cv.fillPoly([[cx - 18, cy - 8], [cx - 4, cy - 14], [cx + 2, cy - 2], [cx - 10, cy + 6], [cx - 20, cy + 2]], GREEN);
  cv.fillPoly([[cx + 6, cy + 4], [cx + 18, cy + 2], [cx + 20, cy + 12], [cx + 10, cy + 18], [cx + 2, cy + 12]], SAND);
  cv.circle(cx, cy, 24, NAVY, 2);
  cv.line(cx - 24, cy, cx + 24, cy, NAVY, 1);
  cv.line(cx, cy - 24, cx, cy + 24, NAVY, 1);
  // Crack across the globe.
  cv.polyline([[cx - 16, cy - 18], [cx - 6, cy - 6], [cx - 12, cy + 4], [cx + 2, cy + 12], [cx + 10, cy + 20]], RED, 2);
  // "1.5C" crossed out, and the late badge.
  drawText(cv, "1.5C", x + w - 8, y + 8, 3, RED, "right");
  cv.line(x + w - 78, y + 20, x + w - 10, y + 8, RED, 2);
  drawText(cv, "44H LATE", x + w - 8, y + 40, 2.5, INK, "right");
}

function drawGulf(cv, x, y, w, h) {
  // Riyadh towers.
  cv.rect(x + 20, y + 26, 22, 30, NAVY);
  cv.rect(x + 52, y + 14, 26, 42, [70, 90, 120]);
  cv.rect(x + 88, y + 30, 20, 26, NAVY);
  cv.rect(x + 118, y + 22, 24, 34, [70, 90, 120]);
  cv.tri(x + 52, y + 14, x + 65, y + 2, x + 78, y + 14, GOLD);
  // Missile streaks coming down from the top right.
  cv.line(x + w - 20, y + 2, x + 150, y + 22, RED, 2);
  cv.line(x + w - 40, y + 2, x + 180, y + 18, RED, 2);
  cv.line(x + w - 60, y + 2, x + 210, y + 14, RED, 2);
  cv.fillCircle(x + 150, y + 22, 3, RED);
  cv.fillCircle(x + 180, y + 18, 3, RED);
  cv.fillCircle(x + 210, y + 14, 3, RED);
  // Intercept burst.
  const bx = x + w - 90;
  const by = y + 34;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * i) / 4;
    cv.line(bx, by, bx + 12 * Math.cos(a), by + 12 * Math.sin(a), GOLD, 2);
  }
  cv.fillCircle(bx, by, 4, GOLD);
  // Ground line.
  cv.hline(x + 8, y + 56, w - 16, INK, 2);
}

// Small pictograms for the ten cards (drawn in a 195x28 strip).
function drawCardArt(cv, art, x, y, w) {
  const cx = x + w / 2;
  const cy = y + 14;
  if (art === "cricket") {
    cv.line(cx - 30, cy + 10, cx - 2, cy - 10, [150, 110, 60], 5);
    cv.fillCircle(cx + 18, cy - 6, 5, RED);
    cv.line(cx - 44, cy + 12, cx + 44, cy + 12, GREEN, 2);
  } else if (art === "flags") {
    cv.rect(cx - 46, cy - 10, 30, 20, BLUE);
    cv.fillCircle(cx - 31, cy, 3, GOLD);
    cv.rect(cx + 16, cy - 10, 30, 10, BLUE);
    cv.rect(cx + 16, cy, 30, 10, GOLD);
  } else if (art === "ship") {
    cv.fillPoly([[cx - 40, cy + 2], [cx + 40, cy + 2], [cx + 30, cy + 12], [cx - 30, cy + 12]], NAVY);
    cv.rect(cx - 8, cy - 10, 16, 12, INK);
    cv.fillPoly([[cx + 18, cy - 12], [cx + 26, cy - 2], [cx + 12, cy - 2]], RED);
    cv.fillPoly([[cx + 26, cy - 12], [cx + 32, cy - 2], [cx + 22, cy - 2]], GOLD);
  } else if (art === "flame") {
    cv.fillPoly([[cx, cy - 12], [cx + 10, cy + 2], [cx + 6, cy + 12], [cx - 6, cy + 12], [cx - 10, cy + 2]], RED);
    cv.fillPoly([[cx, cy - 4], [cx + 5, cy + 4], [cx + 3, cy + 10], [cx - 3, cy + 10], [cx - 5, cy + 4]], GOLD);
  } else if (art === "ballot") {
    cv.rect(cx - 30, cy - 6, 60, 18, NAVY);
    cv.rect(cx - 14, cy - 12, 28, 8, WHITE);
    cv.line(cx - 14, cy - 12, cx + 14, cy - 12, INK, 1);
    cv.line(cx - 8, cy + 4, cx - 2, cy + 10, GREEN, 2);
    cv.line(cx - 2, cy + 10, cx + 10, cy - 4, GREEN, 2);
  } else if (art === "magnifier") {
    cv.circle(cx - 8, cy - 2, 10, INK, 2);
    cv.line(cx + 0, cy + 6, cx + 16, cy + 12, INK, 3);
    cv.fillCircle(cx - 8, cy - 2, 3, BLUE);
  } else if (art === "car") {
    cv.fillPoly([[cx - 40, cy + 2], [cx - 30, cy - 8], [cx - 10, cy - 10], [cx + 10, cy - 10], [cx + 30, cy - 8], [cx + 40, cy + 2], [cx + 40, cy + 10], [cx - 40, cy + 10]], RED);
    cv.fillCircle(cx - 22, cy + 10, 6, INK);
    cv.fillCircle(cx + 22, cy + 10, 6, INK);
    cv.fillCircle(cx - 22, cy + 10, 2, WHITE);
    cv.fillCircle(cx + 22, cy + 10, 2, WHITE);
  } else if (art === "racket") {
    cv.circle(cx - 14, cy - 4, 11, INK, 2);
    cv.line(cx - 14, cy - 4, cx - 14, cy + 4, INK, 1);
    cv.line(cx - 6, cy + 4, cx + 8, cy + 12, [150, 110, 60], 3);
    cv.fillCircle(cx + 22, cy - 8, 5, GREEN);
  } else if (art === "wall") {
    cv.rect(cx - 40, cy - 10, 80, 20, [150, 120, 100]);
    cv.hline(cx - 40, cy, 80, INK, 1);
    cv.vline(cx - 14, cy - 10, 10, INK, 1);
    cv.vline(cx + 12, cy, 10, INK, 1);
    cv.line(cx - 40, cy - 10, cx + 40, cy + 10, RED, 2);
  } else if (art === "podium") {
    cv.fillPoly([[cx - 30, cy + 12], [cx - 18, cy - 10], [cx + 18, cy - 10], [cx + 30, cy + 12]], NAVY);
    cv.line(cx, cy - 10, cx, cy - 16, INK, 2);
    cv.fillCircle(cx, cy - 17, 3, INK);
  }
}

// Simplified world map (lon/lat polygons, equirectangular).
const CONTINENTS = [
  [[-168, 66], [-150, 70], [-130, 71], [-110, 73], [-95, 80], [-85, 76], [-75, 72], [-65, 60], [-55, 52], [-60, 45], [-70, 42], [-75, 35], [-80, 26], [-90, 21], [-97, 16], [-105, 20], [-115, 28], [-125, 40], [-130, 48], [-145, 60], [-160, 58], [-168, 66]],
  [[-78, 8], [-62, 10], [-50, 0], [-35, -8], [-40, -20], [-48, -28], [-58, -35], [-68, -50], [-72, -54], [-73, -40], [-75, -20], [-80, -5], [-78, 8]],
  [[-10, 36], [-9, 43], [-2, 48], [2, 51], [8, 55], [12, 56], [18, 56], [21, 55], [24, 58], [28, 60], [30, 62], [32, 70], [40, 68], [35, 65], [30, 60], [28, 55], [25, 45], [22, 40], [18, 40], [12, 44], [8, 44], [3, 43], [0, 40], [-2, 37], [-9, 37], [-10, 36]],
  [[-17, 15], [-15, 25], [-10, 31], [-5, 35], [0, 36], [10, 37], [20, 32], [30, 31], [35, 28], [40, 20], [43, 12], [48, 11], [51, 10], [46, 5], [40, -5], [38, -15], [35, -22], [30, -28], [25, -33], [19, -35], [16, -28], [14, -22], [12, -17], [10, -8], [8, 4], [4, 6], [-8, 4], [-13, 8], [-17, 15]],
  [[30, 70], [40, 68], [50, 69], [60, 70], [70, 72], [80, 73], [90, 75], [100, 76], [110, 74], [120, 73], [130, 72], [140, 72], [150, 70], [160, 69], [170, 66], [178, 65], [170, 60], [162, 58], [158, 52], [150, 45], [142, 42], [135, 35], [130, 33], [127, 40], [122, 38], [120, 30], [115, 22], [110, 20], [108, 12], [105, 8], [100, 8], [98, 10], [95, 16], [92, 21], [88, 22], [85, 20], [80, 13], [77, 8], [75, 15], [72, 20], [68, 23], [65, 25], [60, 25], [57, 26], [54, 27], [52, 29], [50, 30], [48, 30], [45, 35], [42, 38], [40, 42], [38, 45], [35, 48], [32, 55], [30, 60], [30, 70]],
  [[113, -22], [114, -30], [115, -33], [120, -34], [125, -33], [130, -32], [135, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -22], [146, -19], [142, -11], [140, -14], [136, -12], [132, -12], [128, -14], [124, -14], [120, -15], [116, -18], [113, -22]],
];

function drawMap(cv, x, y, w, h) {
  cv.rect(x, y, w, h, [214, 228, 238]);
  cv.frame(x, y, w, h, NAVY, 2);
  for (const poly of CONTINENTS) {
    const pts = poly.map((p) => [x + ((p[0] + 180) / 360) * w, y + ((85 - p[1]) / 145) * h]);
    cv.fillPoly(pts, SAND);
    cv.polyline([...pts, pts[0]], NAVY, 1);
  }
  // Numbered pins for stories 1-13.
  for (let i = 0; i < PINS.length; i++) {
    const [lat, lon] = PINS[i];
    let px = x + ((lon + 180) / 360) * w;
    let py = y + ((85 - lat) / 145) * h;
    if (i === 12) { px += 11; py -= 9; } // pin 13 sits beside pin 9
    cv.fillCircle(px, py, 8, RED);
    cv.circle(px, py, 8, WHITE, 1);
    drawText(cv, String(i + 1), px, py - 4, 1.25, WHITE, "center");
  }
}

// ------------------------------------------------------------------
// Layout (1024 x 1024, top to bottom)
//   masthead 0-66 | kicker 66-92 | stats 92-156 | region 156-178
//   heroes 178-358 | cards 358-554 | map+briefs 554-864
//   DATE CHECK 864-992 | footer 992-1024
// ------------------------------------------------------------------
function render() {
  const cv = new Canvas(W, H, PAPER);
  const counts = regionCounts();

  // ---- Masthead --------------------------------------------------
  drawText(cv, "THE WORLD IN ONE PAGE", W / 2, 2, 4, INK, "center");
  drawText(cv, "SUNDAY 22 NOVEMBER 2026", W / 2, 31, 5, RED, "center");
  drawText(cv, TOTAL_STORIES + " STORIES", 8, 40, 2.5, RED);
  drawText(cv, "6 REGIONS", W - 8, 40, 2.5, RED, "right");
  cv.hline(8, 64, W - 16, INK, 2);

  // ---- Kicker ----------------------------------------------------
  drawText(cv, "G20 IN AFRICA • COP31 FAILS • RIYADH HIT", W / 2, 67, 3.5, INK, "center");
  cv.hline(8, 90, W - 16, RED, 2);

  // ---- Stat strip -------------------------------------------------
  for (let i = 0; i < STATS.length; i++) {
    const x = 8 + i * 168;
    drawText(cv, STATS[i].num, x + 84, 93, 4, RED, "center");
    drawText(cv, STATS[i].label[0], x + 84, 122, 2.25, INK, "center");
    drawText(cv, STATS[i].label[1], x + 84, 139, 2.25, INK, "center");
    if (i > 0) cv.vline(x, 96, 56, GREY, 1);
  }
  cv.hline(8, 154, W - 16, INK, 1);

  // ---- Region strip (counted from the data) -----------------------
  const regionText = REGION_ORDER.filter((r) => counts[r] > 0)
    .map((r) => r + " " + counts[r]).join(" • ");
  drawText(cv, regionText, W / 2, 160, 2.25, NAVY, "center");

  // ---- Heroes ------------------------------------------------------
  const heroX = [8, 347, 686];
  for (let i = 0; i < HEROES.length; i++) {
    const h = HEROES[i];
    const x = heroX[i];
    cv.rect(x, 178, 330, 180, PANEL);
    cv.frame(x, 178, 330, 180, INK, 2);
    drawText(cv, h.n + " " + h.place + " " + h.beat, x + 10, 182, 2.5, RED);
    drawText(cv, h.head[0], x + 10, 203, 3.5, INK);
    drawText(cv, h.head[1], x + 10, 231, 3.5, INK);
    if (h.art === "g20") drawG20(cv, x + 6, 256, 318, 60);
    if (h.art === "cop31") drawCOP31(cv, x + 6, 256, 318, 60);
    if (h.art === "gulf") drawGulf(cv, x + 6, 256, 318, 60);
    drawText(cv, h.body[0], x + 10, 316, 2.75, INK);
    drawText(cv, h.body[1], x + 10, 337, 2.75, INK);
  }

  // ---- Small cards --------------------------------------------------
  const cardX = [8, 211, 414, 617, 820];
  for (let i = 0; i < CARDS.length; i++) {
    const c = CARDS[i];
    const row = Math.floor(i / 5);
    const col = i % 5;
    const x = cardX[col];
    const y = 358 + row * 98;
    cv.rect(x, y, 195, 98, WHITE);
    cv.frame(x, y, 195, 98, INK, 1);
    drawCardArt(cv, c.art, x, y + 2, 195);
    drawText(cv, c.src, x + 189, y + 6, 2, GREY, "right");
    drawText(cv, c.n + " " + c.place, x + 6, y + 32, 2.25, RED);
    drawText(cv, c.head[0], x + 6, y + 49, 3.25, INK);
    drawText(cv, c.head[1], x + 6, y + 74, 3.25, INK);
  }

  // ---- Map + legend --------------------------------------------------
  drawText(cv, "WHERE IT HAPPENED", 8 + 110, 556, 2, NAVY, "center");
  drawMap(cv, 8, 578, 220, 124);
  drawText(cv, "PINS = STORIES 1-13", 8 + 110, 706, 1.75, INK, "center");
  drawText(cv, "POSITIONS APPROX.", 8 + 110, 720, 1.75, GREY, "center");
  cv.rect(8, 740, 220, 124, PANEL);
  cv.frame(8, 740, 220, 124, INK, 1);
  drawText(cv, "HOW SURE ARE WE?", 18, 748, 2, RED);
  drawText(cv, "REPORTED = SOURCED", 18, 768, 1.75, INK);
  drawText(cv, "CLAIM = ONE SIDE", 18, 784, 1.75, INK);
  drawText(cv, "FORECAST = PLAN", 18, 800, 1.75, INK);
  drawText(cv, "SRC: REU=REUTERS", 18, 818, 1.75, GREY);
  drawText(cv, "GDN=GUARDIAN", 18, 834, 1.75, GREY);
  drawText(cv, "AJZ=AL JAZEERA", 18, 850, 1.75, GREY);

  // ---- Brief list -----------------------------------------------------
  drawText(cv, "ALSO ON SUNDAY", 236, 556, 3, NAVY);
  for (let i = 0; i < BRIEFS.length; i++) {
    const b = BRIEFS[i];
    const col = Math.floor(i / 12);
    const row = i % 12;
    const bx = col === 0 ? 236 : 630;
    const by = 578 + row * 23.5;
    let head = b.n + " " + b.place + " " + b.head;
    // Safety: never let a brief run past its column.
    while (textWidthAdv(head, 2.5, 5.5) > 330 && head.length > 8) {
      head = head.slice(0, -1);
    }
    drawTextAdv(cv, head, bx, by, 2.5, INK, 5.5);
    drawText(cv, b.src, bx + textWidthAdv(head, 2.5, 5.5) + 6, by, 2, GREY);
  }

  // ---- DATE CHECK ------------------------------------------------------
  cv.rect(8, 864, W - 16, 128, [250, 238, 232]);
  cv.frame(8, 864, W - 16, 128, RED, 2);
  drawText(cv, DATECHECK_HEAD, 16, 867, 3.25, RED);
  for (let i = 0; i < DATECHECK.length; i++) {
    drawText(cv, DATECHECK[i], 16, 891 + i * 20, 2.75, INK);
  }

  // ---- Footer ------------------------------------------------------------
  drawText(cv, "EVERY STORY HERE HAPPENED OR WAS FIRST REPORTED ON SUNDAY 22 NOVEMBER 2026", W / 2, 993, 2, INK, "center");
  drawText(cv, "SOURCES: REUTERS • AP • AFP • BBC • AL JAZEERA • UN NEWS • ATP", W / 2, 1009, 2, GREY, "center");

  return encodePNG(W, H, cv.buf);
}

// ------------------------------------------------------------------
// Entrypoint — canonical output cleaning (see makefun-grader-
// entrypoint): empty the output dir's CONTENTS, never the dir
// itself — in the grader /output is a volume mount point and
// rmSync on it throws EBUSY.
// ------------------------------------------------------------------
function resolveOutputDir() {
  return process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
}

function prepareOutputDir(outputDir) {
  mkdirSync(outputDir, { recursive: true });
  for (const entry of readdirSync(outputDir)) {
    rmSync(join(outputDir, entry), { recursive: true, force: true });
  }
}

function main() {
  const png = render();
  const out = resolveOutputDir();
  prepareOutputDir(out);
  writeFileSync(join(out, "entry.png"), png);
  console.log("wrote " + join(out, "entry.png") + " " + png.length + " bytes");
}

main();
