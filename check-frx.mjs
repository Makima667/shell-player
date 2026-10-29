import fs from "node:fs";
import { compileSource } from "./src/sources/compile.js";
const P = "C:/Users/q1763/Documents/shell-player/sources/musicfree/plugins/";
for (const [file, kw] of [["qq-official.js", "发如雪"], ["wy-official.js", "发如雪"]]) {
  const src = await compileSource(fs.readFileSync(P + file, "utf8"), { env: "desktop" });
  console.log(`\n### ${file}`);
  const s = await src.search(kw, 1);
  console.log(`  结果 ${s.list.length} 条，前 5：`);
  for (const it of s.list.slice(0, 5)) {
    const raw = it.mf || it;
    let out;
    try {
      const r = await src.getUrl(it, "high");
      out = `OK ${r.quality}`;
    } catch (e) { out = "FAIL " + String(e.message).slice(0, 46); }
    console.log(`   ${String(it.title).padEnd(14)} ${String(it.artist).slice(0,10).padEnd(11)} pay=${JSON.stringify(raw.pay ? {play: raw.pay.pay_play, down: raw.pay.pay_down} : null)} -> ${out}`);
  }
}
