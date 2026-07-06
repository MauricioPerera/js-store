// Benchmark de SemanticCollection: search / searchHybrid / reindex a varias escalas.
// Mide lo que el audit señalo como no-medido (#5). Numeros reales, no asertos.
const { SemanticCollection } = require("../src/index.js");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { performance } = require("node:perf_hooks");

const DIM = 64;
// PRNG sembrado (reproducible, sin Math.random)
let _s = 123456789;
function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
function vec() { const v = new Array(DIM); for (let i=0;i<DIM;i++) v[i]=rnd()*2-1; return v; }
const VOCAB = "gato perro pez ave rojo azul verde grande chico rapido lento agua fuego tierra aire luz".split(" ");
function text() { let t=[]; for (let i=0;i<6;i++) t.push(VOCAB[Math.floor(rnd()*VOCAB.length)]); return t.join(" "); }
function pct(arr, p) { const s=[...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(p/100*s.length))]; }
function stat(times) { const mean=times.reduce((a,b)=>a+b,0)/times.length; return `mean=${mean.toFixed(3)}ms p50=${pct(times,50).toFixed(3)} p95=${pct(times,95).toFixed(3)}`; }

function benchQueries(sc, n, hybrid) {
  const times=[];
  // warmup
  for (let i=0;i<20;i++){ const q=vec(); hybrid?sc.searchHybrid(q,text(),{limit:10,textField:"t"}):sc.search(q,{limit:10}); }
  for (let i=0;i<n;i++){ const q=vec(); const q2=hybrid?text():null; const t0=performance.now(); hybrid?sc.searchHybrid(q,q2,{limit:10,textField:"t"}):sc.search(q,{limit:10}); times.push(performance.now()-t0); }
  return stat(times);
}

console.log(`Node ${process.version} | DIM=${DIM}\n`);

// ---- MEMORIA: upsert throughput + search + searchHybrid ----
console.log("== MODO MEMORIA ==");
for (const N of [1000, 10000, 50000]) {
  const sc = new SemanticCollection({ dim: DIM });
  const t0=performance.now();
  for (let i=0;i<N;i++) sc.upsert("d"+i, {t:text()}, vec());
  const upMs=performance.now()-t0;
  const searchStat = benchQueries(sc, 200, false);
  const hybridStat = benchQueries(sc, 100, true);
  console.log(`N=${String(N).padStart(6)} | upsert ${(N/(upMs/1000)).toFixed(0)} docs/s | search ${searchStat} | searchHybrid ${hybridStat}`);
}

// ---- DISCO: upsert (fsync) + reindex (IVF/kmeans) + search con IVF + RAM de searchHybrid ----
console.log("\n== MODO DISCO (fsync por escritura) ==");
for (const N of [1000, 10000]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"bench-"));
  const p = path.join(dir,"col");
  const sc = new SemanticCollection({ path: p, dim: DIM });
  const t0=performance.now();
  for (let i=0;i<N;i++) sc.upsert("d"+i, {t:text()}, vec());
  const upMs=performance.now()-t0;
  // reindex (kmeans): nClusters ~ sqrt(N)
  const nClusters=Math.max(2, Math.round(Math.sqrt(N))); const nProbe=Math.max(1, Math.round(nClusters/8));
  const t1=performance.now(); sc.reindex(nClusters, nProbe); const reMs=performance.now()-t1;
  const searchStat = benchQueries(sc, 100, false);
  // RAM: RSS antes vs durante searchHybrid (el caveat: materializa docs en RAM)
  if (global.gc) global.gc();
  const rssBefore=process.memoryUsage().rss;
  let peak=rssBefore;
  for (let i=0;i<20;i++){ sc.searchHybrid(vec(), text(), {limit:10, textField:"t"}); const r=process.memoryUsage().rss; if(r>peak)peak=r; }
  const deltaMB=((peak-rssBefore)/1048576).toFixed(1);
  console.log(`N=${String(N).padStart(6)} | upsert ${(N/(upMs/1000)).toFixed(0)} docs/s | reindex(kmeans,${nClusters}cl) ${reMs.toFixed(0)}ms | search(IVF) ${searchStat} | searchHybrid RSS +${deltaMB}MB`);
  sc.close(); fs.rmSync(dir,{recursive:true,force:true});
}
console.log("\n(nota: search en disco usa el IVF tras reindex; searchHybrid recorre BM25 en RAM — de ahi el delta de RSS)");
