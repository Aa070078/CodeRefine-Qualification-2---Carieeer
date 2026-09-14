import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['requirements','data-model','api-design','architecture','flows'];
const receipts=JSON.parse(fs.readFileSync(path.join(root,'diagrams/mcp/checkpoints.json'),'utf8'));
let links=0,elements=0;
const slug=s=>s.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s/g,'-');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>['.git','node_modules'].includes(e.name)?[]:e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
for(const file of walk(root).filter(f=>f.endsWith('.md'))){const src=fs.readFileSync(file,'utf8');
 for(const m of src.matchAll(/\]\(([^)]+)\)/g)){const link=m[1];if(/^(https?:|mailto:)/.test(link))continue;
  const [dest,anchor]=link.split('#');const p=path.resolve(path.dirname(file),decodeURIComponent(dest||path.basename(file)));
  assert.ok(fs.existsSync(p),`Broken link: ${file}: ${link}`);links++;
  if(anchor&&p.endsWith('.md')){const headings=[...fs.readFileSync(p,'utf8').matchAll(/^#+ (.+)$/gm)].map(m=>slug(m[1]));assert.ok(headings.includes(anchor),`Broken anchor ${link}`);}
 }
}
for(const n of names){const scene=JSON.parse(fs.readFileSync(path.join(root,`diagrams/mcp/${n}.json`),'utf8'));
 const doc=JSON.parse(fs.readFileSync(path.join(root,`diagrams/${n}.excalidraw`),'utf8'));
 assert.equal(doc.type,'excalidraw');assert.equal(doc.version,2);assert.equal(scene[0].type,'cameraUpdate');
 assert.ok(receipts[n]?.structuredContent?.checkpointId,`Missing MCP receipt ${n}`);
 const ids=new Set(doc.elements.map(e=>e.id));assert.equal(ids.size,doc.elements.length,`Duplicate ID ${n}`);
 for(const e of doc.elements){elements++;assert.ok(['rectangle','ellipse','text','arrow'].includes(e.type));
  assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.y));assert.ok(e.width>=0&&e.height>=0);
  if(e.containerId)assert.ok(ids.has(e.containerId));
  if(e.type==='text')assert.ok(e.text.trim()&&e.fontSize>=20);
  if(e.type==='rectangle'||e.type==='ellipse')assert.ok(e.boundElements?.some(b=>b.type==='text'),`Unlabeled shape ${e.id}`);
 }
 assert.equal(doc.elements.filter(e=>e.type==='rectangle'||e.type==='ellipse').length,scene.filter(e=>e.label).length);
 for(const ext of ['svg','png'])assert.ok(fs.statSync(path.join(root,`diagrams/exports/${n}.${ext}`)).size>1000);
}
const api=fs.readFileSync(path.join(root,'docs/api-design.md'),'utf8');
for(const s of ['Applied','Screened','Interview','Offer','Rejected','IDEMPOTENCY_KEY_REUSED','If-Match','ALREADY_APPLIED'])assert.ok(api.includes(s));
console.log(`PASS: ${links} relative links/anchors; 5 editable scenes + MCP receipts; ${elements} elements; 10 exports; core API invariants.`);
