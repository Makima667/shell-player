import fs from "node:fs";
import { compileSource } from "./src/sources/compile.js";
const P = "C:/Users/q1763/Documents/shell-player/sources/musicfree/plugins/qq-official.js";
const src = await compileSource(fs.readFileSync(P, "utf8"), { env: "desktop" });
const s = await src.search("发如雪", 1);
const target = s.list.find(t => t.title === "发如雪" && t.artist.includes("周杰伦"));
const r = await src.getUrl(target, "high");
const head = await fetch(r.url, { headers: { Range: "bytes=0-0", Referer: "https://y.qq.com/" } });
console.log("quality:", r.quality, "size字段:", r.size ?? "-", "content-range:", head.headers.get("content-range"));
console.log("url:", r.url.slice(0, 80));
// 4:59 的 128k mp3 约 4.5–4.8MB；0.9MB 说明只是试听片段
