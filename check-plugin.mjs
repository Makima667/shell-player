import fs from "node:fs";
import { compileSource } from "./src/sources/compile.js";
const src = await compileSource(fs.readFileSync("C:/Users/q1763/Documents/shell-player/sources/musicfree/plugins/wy-official.js", "utf8"), { env: "desktop" });
const s = await src.search("起风了", 1);
const t = s.list[0];
for (const q of ["standard", "high", "super"]) {
  const r = await src.getUrl(t, q);
  const resp = await fetch(r.url, { headers: { Range: "bytes=0-1023" } });
  console.log(q, "->", resp.status, resp.headers.get("content-type"), r.quality, "|", r.url.slice(0, 70));
}
const lyr = await src.getLyric(t);
console.log("lyric len:", (lyr.lrc || "").length, "trans:", (lyr.trans || "").length);
