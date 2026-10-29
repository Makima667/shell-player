import fs from "node:fs";
import { compileSource } from "./src/sources/compile.js";
const P = "C:/Users/q1763/Documents/shell-player/sources/musicfree/plugins/qq-official.js";
const src = await compileSource(fs.readFileSync(P, "utf8"), { env: "desktop" });
console.log("platform:", src.name, "v" + src.version);
for (const kw of ["青花瓷", "晴天"]) {
  const t0 = Date.now();
  const s = await src.search(kw, 1);
  console.log(`\n[${kw}] search ${Date.now()-t0}ms -> ${s.list.length} 首`);
  for (const it of s.list.slice(0, 3)) {
    let out;
    try {
      const r = await src.getUrl(it, "high");
      const resp = await fetch(r.url, { headers: { Range: "bytes=0-1023", Referer: "https://y.qq.com/" } });
      out = `${r.quality} ${resp.status} ${resp.headers.get("content-type")}`;
    } catch (e) { out = "FAIL " + e.message.slice(0, 60); }
    console.log(`  ${it.title}/${it.artist} vip=${it.vip} -> ${out}`);
  }
}
const s = await src.search("晴天", 1);
const lyr = await src.getLyric(s.list[0]);
console.log("\nlyric len:", (lyr.lrc || "").length, "| head:", (lyr.lrc || "").slice(0, 40));
