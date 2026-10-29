import fs from "node:fs";
process.on("unhandledRejection", () => {});
const log = console.log; console.log = () => {};
const { SourceManager } = await import("./src/sources/manager.js");
const { compileSource } = await import("./src/sources/compile.js");

const mem = new Map();
const store = { get: (k, d) => (mem.has(k) ? mem.get(k) : d), set: (k, v) => mem.set(k, v) };
const builtins = [];
const mgr = new SourceManager({ store, builtins, env: "desktop" });

const P = "C:/Users/q1763/Documents/shell-player/sources/musicfree/plugins/";
const L = "C:/Users/q1763/Documents/shell-player/sources/lx/";
await mgr.add(fs.readFileSync(P + "kg-official.js", "utf8"), { id: "u:kg" });
for (const f of ["xinghai.js", "juhe-lerd.js", "molan.js"]) {
  await mgr.add(fs.readFileSync(L + f, "utf8"), { id: "lx:" + f.replace(".js", "") });
}
await mgr.loadAll();

const out = (s) => process.stdout.write(s + "\n");
out("音源: " + mgr.enabled().join(", "));

const r = await mgr.search(["u:kg"], "晴天", 1, { timeout: 15000 });
out(`搜索: ${r.results.length} 条，前 3：`);
for (const t of r.results.slice(0, 3)) out(`  ${t.title} / ${t.artist} hash=${t.id} lxKey=${t.lxKey} dur=${t.duration}`);

const target = r.results[0];
for (const q of ["super", "high"]) {
  const t0 = Date.now();
  try {
    const got = await mgr.resolveUrl(target, q, { failover: false });
    const resp = await fetch(got.url, { headers: { Range: "bytes=0-1023" } });
    const cr = resp.headers.get("content-range") || "";
    const total = Number((cr.match(/\/(\d+)$/) || [])[1] || 0);
    const kbps = total && target.duration ? Math.round((total * 8) / (target.duration / 1000) / 1000) : 0;
    out(`${q}: via=${got.via} quality=${got.quality} ${resp.status} ${resp.headers.get("content-type")} ${total ? (total / 1048576).toFixed(1) + "MB" : ""} ${kbps ? kbps + "kbps" : ""} (${Date.now() - t0}ms)`);
  } catch (e) {
    out(`${q}: ✖ ${String(e.message).replace(/\n/g, " | ").slice(0, 120)} (${Date.now() - t0}ms)`);
  }
}
