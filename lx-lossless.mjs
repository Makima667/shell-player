process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});
import fs from "node:fs";
import path from "node:path";
import { compileSource } from "./src/sources/compile.js";

const out = (s) => process.stdout.write(s + "\n");
const realLog = console.log, realErr = console.error;
console.log = () => {}; console.error = () => {}; console.warn = () => {};

const LX_DIR = "C:/Users/q1763/Documents/shell-player/sources/lx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";
const TRACKS = {
  tx: { title: "晴天", artist: "周杰伦", mid: "0039MnYb0qxYhV", songmid: "0039MnYb0qxYhV", duration: 269000, lxKey: "tx" },
  wy: { title: "晴天", artist: "周杰伦", id: 186016, duration: 269000, lxKey: "wy" },
  kg: { title: "晴天", artist: "周杰伦", hash: "B3A52A7A958BF0AED0EBFBA2E9A818B7", duration: 269000, lxKey: "kg" },
  kw: { title: "晴天", artist: "周杰伦", id: "228908", duration: 269000, lxKey: "kw" },
};
const head = async (url) => {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Range: "bytes=0-1023" }, signal: AbortSignal.timeout(15000) });
    const cr = r.headers.get("content-range") || "";
    return { status: r.status, type: r.headers.get("content-type") || "", total: Number((cr.match(/\/(\d+)$/) || [])[1] || 0) };
  } catch (e) { return { err: e.cause?.code || e.message }; }
};

const files = fs.readdirSync(LX_DIR).filter(f => f.endsWith(".js")).sort();
for (const file of files) {
  const slug = file.replace(/\.js$/, "");
  let src;
  try { src = await compileSource(fs.readFileSync(path.join(LX_DIR, file), "utf8"), { env: "desktop" }); }
  catch (e) { out(`- ${slug}: 编译失败`); continue; }
  const keys = src.lxKeys || [];
  const cells = [];
  for (const key of Object.keys(TRACKS)) {
    if (!keys.includes(key)) continue;
    const t = TRACKS[key];
    for (const q of ["flac", "320k"]) {
      try {
        const got = await Promise.race([src.getUrl(t, q), new Promise((_, rj) => setTimeout(() => rj(new Error("超时")), 12000))]);
        if (!got?.url) { cells.push(`${key}/${q}=空`); continue; }
        const h = await head(got.url);
        const kbps = h.total && t.duration ? Math.round((h.total * 8) / (t.duration / 1000) / 1000) : 0;
        cells.push(`${key}/${q}=${got.quality} ${h.status}${h.total ? " " + (h.total / 1048576).toFixed(1) + "MB" : ""}${kbps ? " " + kbps + "k" : ""}`);
      } catch (e) { cells.push(`${key}/${q}=✖${String(e.message).slice(0, 12)}`); }
    }
  }
  out(`${slug.padEnd(16)} [${keys.join(",")}]  ${cells.join("  ")}`);
}

