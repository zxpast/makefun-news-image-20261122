// make.fun news-image-20261122 — "The World in One Page: Sunday 22 November 2026"
// Draws a 1024x1024 PNG of the day's world news, programmatically, stdlib only.
// No network, no fonts, no images: own PNG encoder + own 5x7 bitmap font.
// Deterministic: same bytes on every run.
//
// STORY DATA — one clearly-delimited array. A refresh pass can replace this
// array before submit. Every story below was first reported on Sunday
// 22 November 2026 (any timezone) by BBC, Reuters or Times of India, and
// was contradiction-scanned before inclusion: no two stories disagree, and
// none predates 13 November 2026.
//
//   tag  = region code shown as a coloured chip (UKR, MID, AME, ASI, SPT, ECO)
//   text = one short headline, at most 2 lines at the grid size.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const STORIES: { tag: string; text: string }[] = [
  // UKRAINE & EUROPE
  { tag: "UKR", text: "Russia hits Kyiv bridges and rail stations in major overnight attack" },
  { tag: "UKR", text: "Drones strike Russia-bound cargo ship in Gulf of Finland" },
  { tag: "UKR", text: "Denmark says Russia plotted to kill US-Ukrainian rapper" },
  { tag: "UKR", text: "Russian missile crashes in Poland; Warsaw calls it a provocation" },
  { tag: "UKR", text: "Sweden summons Russia's ambassador as tensions rise" },
  { tag: "UKR", text: "Zelenskyy: new Ukraine peace talks could happen at the G20" },
  { tag: "UKR", text: "French police sentenced over beating of music producer Zecler" },
  { tag: "UKR", text: "Miliband: EU deal does not depend on tuition-fees pact" },
  // MIDDLE EAST
  { tag: "MID", text: "Two tankers hit by mystery projectiles off Oman" },
  { tag: "MID", text: "Saudi coalition downs three Houthi missiles aimed at Riyadh" },
  { tag: "MID", text: "Four Palestinians killed in Israeli ceasefire violations in Gaza" },
  { tag: "MID", text: "Eisenkot invites Netanyahu's Likud into coalition talks" },
  { tag: "MID", text: "Trump seeks permanent Iran nuclear deal 'to last 20 years'" },
  { tag: "MID", text: "Bahrain probes Patriot interceptor crash amid Iran drone reports" },
  { tag: "MID", text: "Iran: Qeshm Island blasts were US munitions disposal, not attack" },
  { tag: "MID", text: "France and US draft UN resolution for post-UNIFIL Lebanon" },
  // AMERICAS
  { tag: "AME", text: "Cartel lord 'El Chapo Isidro' held; 11 killed in Sinaloa violence" },
  { tag: "AME", text: "FBI probes apparent hack of its criminal database" },
  { tag: "AME", text: "Man convicted of starting Los Angeles Palisades fire" },
  { tag: "AME", text: "Judge approves $7.25bn Roundup cancer-claims settlement" },
  { tag: "AME", text: "Bolsonaro in ICU with acute bowel obstruction" },
  { tag: "AME", text: "US airlines warned of possible al-Qaeda attacks before Thanksgiving" },
  { tag: "AME", text: "Gupta gets 19 years in Pannun murder-plot case" },
  { tag: "AME", text: "Two Indian-origin men shot dead outside Walmart in Canada" },
  { tag: "AME", text: "Hegseth sets fresh limits on US-Canada defence ties" },
  { tag: "AME", text: "US 'open to' Western Hemisphere candidate to lead the UN, Waltz says" },
  // ASIA & PACIFIC
  { tag: "ASI", text: "Chinese bomber flies toward Manila, turns back 170 km out" },
  { tag: "ASI", text: "South Korea offers $75,000 bounty for exam-cheating tips" },
  { tag: "ASI", text: "Pakistan climate minister to attend SCO dialogue in New Delhi" },
  { tag: "ASI", text: "Trump calls China's nuclear build-up 'rapid and concerning'" },
  // SPORT
  { tag: "SPT", text: "Pant century as India pile up 629-6, a record total in New Zealand" },
  { tag: "SPT", text: "Zverev beats Medvedev 7-6, 6-4 to reach ATP Finals title match" },
  { tag: "SPT", text: "Real Madrid edge Celta 2-1; Newcastle hold Arsenal 2-2" },
  { tag: "SPT", text: "Napoli beat Torino 1-0; Palmeiras draw 1-1 with Flamengo" },
  // CLIMATE, MARKETS & MORE
  { tag: "ECO", text: "COP31 climate talks deadlocked in fight over fossil fuels" },
  { tag: "ECO", text: "Tech stocks slide as Anthropic shares fall" },
  { tag: "ECO", text: "US declassifies more UFO footage filmed in the Middle East" },
  { tag: "ECO", text: "ANC fights to hold South Africa's big cities after election setback" },
  { tag: "ECO", text: "Four killed, 35 hurt in fire at Basra power plant in Iraq" },
  { tag: "ECO", text: "Russia names Insider reporter Panov a 'foreign agent'" },
];

const TAG_COLORS: Record<string, [number, number, number]> = {
  UKR: [37, 99, 235], // blue — Ukraine & Europe
  MID: [217, 119, 6], // amber — Middle East
  AME: [5, 150, 105], // green — Americas
  ASI: [124, 58, 237], // purple — Asia & Pacific
  SPT: [220, 38, 38], // red — sport
  ECO: [8, 145, 178], // teal — climate, markets & more
};

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is 7 rows of 5 bits, "#" = on, "." = off.
// Only the characters the page uses are defined; all page text is uppercased.
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
};

// ---------------------------------------------------------------------------
// Canvas: an RGB pixel buffer with rect / circle / arc / line / text drawing.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly data: Buffer;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
    }
  }
  // Filled circle.
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r * r) this.set(xx, yy, c);
      }
    }
  }
  // Filled disc segment: angles in degrees, 0 = east, going clockwise
  // (screen y grows downwards).
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB): void {
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy > r * r) continue;
        let a = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (a < 0) a += 360;
        if (a >= a0 && a <= a1) this.set(xx, yy, c);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (dx * i) / n);
      const y = Math.round(y0 + (dy * i) / n);
      for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) this.set(x + a, y + b, c);
    }
  }
  // Text in the 5x7 font. scale s => glyph 5s wide, 7s tall, 1s gap.
  text(x: number, y: number, s: number, c: RGB, raw: string): number {
    const str = raw.toUpperCase();
    let cx = x;
    for (const ch of str) {
      const g = FONT[ch] ?? FONT["?"];
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (g[r][col] === "1") this.fillRect(cx + col * s, y + r * s, s, s, c);
        }
      }
      cx += 6 * s;
    }
    return cx - x;
  }
  textWidth(s: number, raw: string): number {
    return raw.toUpperCase().length * 6 * s - s;
  }
  // Word-wrap into lines of at most maxChars characters; returns the lines.
  static wrap(raw: string, maxChars: number): string[] {
    const words = raw.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur === "") cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur !== "") lines.push(cur);
    return lines;
  }
}

// ---------------------------------------------------------------------------
// PNG encoder: 8-bit RGB, filter 0, zlib deflate. Hand-rolled CRC32.
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(cv.h * (1 + cv.w * 3));
  for (let y = 0; y < cv.h; y++) {
    raw[y * (1 + cv.w * 3)] = 0; // filter: none
    cv.data.copy(raw, y * (1 + cv.w * 3) + 1, y * cv.w * 3, (y + 1) * cv.w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const NAVY: RGB = [15, 34, 66];
const NAVY2: RGB = [24, 48, 88];
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [24, 28, 36];
const MUTED: RGB = [90, 96, 110];
const GOLD: RGB = [201, 162, 39];
const RED: RGB = [178, 34, 34];
const HERO_BG: RGB = [220, 232, 245];
const SKIN: RGB = [230, 177, 131];
const HAIR: RGB = [58, 46, 34];
const BEARD: RGB = [96, 84, 66];
const OLIVE: RGB = [85, 96, 58];
const OLIVE_DK: RGB = [66, 76, 44];
const WHITE: RGB = [255, 255, 255];
const UA_BLUE: RGB = [0, 91, 187];
const UA_YELLOW: RGB = [255, 213, 0];

// ---------------------------------------------------------------------------
// Drawing the page
// ---------------------------------------------------------------------------
function drawHeroFigure(cv: Canvas, cx: number, top: number): void {
  // Stylised cartoon bust of President Volodymyr Zelenskyy: short dark hair,
  // close beard, olive shirt and jacket. Drawn from circles and rectangles.
  const headY = top + 62;
  const headR = 46;
  // shoulders / jacket
  cv.fillRect(cx - 92, top + 118, 184, 74, OLIVE);
  cv.fillRect(cx - 92, top + 118, 184, 10, OLIVE_DK);
  // shirt V at the neck
  cv.fillRect(cx - 16, top + 118, 32, 26, [232, 228, 216]);
  cv.line(cx - 16, top + 118, cx, top + 144, OLIVE_DK, 2);
  cv.line(cx + 16, top + 118, cx, top + 144, OLIVE_DK, 2);
  // neck
  cv.fillRect(cx - 14, top + 96, 28, 26, SKIN);
  // beard: darker disc, then skin disc shifted up leaves a jaw crescent
  cv.circle(cx, headY, headR, BEARD);
  cv.circle(cx, headY - 7, headR - 4, SKIN);
  // hair: dark cap over the top of the head
  cv.arc(cx, headY - 2, headR + 1, 180, 360, HAIR);
  cv.arc(cx, headY - 2, headR - 12, 195, 345, HAIR);
  // ears
  cv.circle(cx - headR, headY + 2, 7, SKIN);
  cv.circle(cx + headR, headY + 2, 7, SKIN);
  // brows + eyes
  cv.fillRect(cx - 30, headY - 12, 20, 4, HAIR);
  cv.fillRect(cx + 10, headY - 12, 20, 4, HAIR);
  cv.fillRect(cx - 22, headY - 2, 6, 6, [30, 26, 22]);
  cv.fillRect(cx + 16, headY - 2, 6, 6, [30, 26, 22]);
  // nose + mouth
  cv.line(cx, headY + 2, cx - 2, headY + 16, [190, 140, 100], 2);
  cv.fillRect(cx - 10, headY + 26, 20, 3, [120, 70, 60]);
  // name plate under the bust
  cv.fillRect(cx - 92, top + 168, 184, 22, NAVY);
  cv.text(cx - 84, top + 173, 1, WHITE, "VOLODYMYR ZELENSKYY");
}

function drawPage(): Buffer {
  const W = 1024;
  const H = 1024;
  const cv = new Canvas(W, H, PAPER);

  // ---- masthead ------------------------------------------------------------
  cv.fillRect(0, 0, W, 96, NAVY);
  cv.fillRect(0, 96, W, 4, GOLD);
  cv.text(24, 14, 2, GOLD, "THE WORLD IN ONE PAGE");
  cv.text(24, 40, 5, WHITE, "SUNDAY 22 NOVEMBER 2026");
  const n = STORIES.length;
  cv.text(884, 16, 2, WHITE, n + " STORIES");
  cv.text(884, 40, 2, GOLD, "6 REGIONS");

  // ---- hero: top story -----------------------------------------------------
  const heroY = 108;
  const heroH = 196;
  cv.fillRect(16, heroY, 992, heroH, HERO_BG);
  cv.fillRect(16, heroY, 992, 2, NAVY);
  cv.fillRect(16, heroY + heroH - 2, 992, 2, NAVY);
  drawHeroFigure(cv, 128, heroY + 2);
  // small Ukraine flag accent
  cv.fillRect(300, heroY + 18, 56, 10, UA_BLUE);
  cv.fillRect(300, heroY + 28, 56, 10, UA_YELLOW);
  // top-story tag
  cv.fillRect(372, heroY + 14, 118, 26, RED);
  cv.text(384, heroY + 20, 2, WHITE, "TOP STORY");
  // headline, two lines at scale 3
  cv.text(300, heroY + 56, 3, INK, "ZELENSKYY: CRIMEA BRIDGE");
  cv.text(300, heroY + 84, 3, INK, "STRIKES 'FAIR RESPONSE'");
  // sublines at scale 2
  cv.text(300, heroY + 126, 2, MUTED, "UKRAINE'S PRESIDENT MEETS BRITAIN'S");
  cv.text(300, heroY + 144, 2, MUTED, "WES STREETING IN KYIV AS PEACE HOPES");
  cv.text(300, heroY + 162, 2, MUTED, "TURN TO THE G20 SUMMIT");

  // ---- story grid: 2 columns x 20 rows ------------------------------------
  const gridTop = 320;
  const rowH = 32;
  const colX = [16, 520];
  const colW = 488;
  const textX = 56; // offset of headline text inside a column
  for (let i = 0; i < STORIES.length; i++) {
    const col = i < 20 ? 0 : 1;
    const row = i % 20;
    const x = colX[col];
    const y = gridTop + row * rowH;
    const s = STORIES[i];
    const color = TAG_COLORS[s.tag];
    // zebra row
    if (row % 2 === 0) cv.fillRect(x, y, colW, rowH, [240, 236, 226]);
    // tag chip
    cv.fillRect(x + 4, y + 8, 36, 16, color);
    cv.text(x + 8, y + 11, 1, WHITE, s.tag);
    // headline, wrapped to at most 2 lines of 36 chars
    const lines = Canvas.wrap(s.text, 36).slice(0, 2);
    lines.forEach((ln, li) => cv.text(x + textX, y + 2 + li * 15, 2, INK, ln));
  }

  // ---- footer --------------------------------------------------------------
  cv.fillRect(0, 968, W, 56, NAVY);
  cv.fillRect(0, 968, W, 3, GOLD);
  cv.text(24, 982, 2, WHITE, "EVERY STORY FIRST REPORTED ON SUNDAY 22 NOVEMBER 2026");
  cv.text(24, 1002, 2, GOLD, "SOURCES: BBC - REUTERS - TIMES OF INDIA");
  cv.text(648, 1002, 2, MUTED, "MAKE.FUN - NEWS-IMAGE-20261122");

  return encodePNG(cv);
}

function main(): void {
  // Guards: every headline must fit 2 lines at 36 chars, and every
  // character used must exist in the font (else it renders as "?").
  for (const s of STORIES) {
    const lines = Canvas.wrap(s.text, 36);
    if (lines.length > 2) throw new Error("headline too long (3+ lines): " + s.text);
    for (const ch of s.text.toUpperCase()) {
      if (!(ch in FONT)) throw new Error("missing glyph for: " + ch);
    }
  }
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = drawPage();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
