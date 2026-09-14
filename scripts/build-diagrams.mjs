// One scene definition feeds Excalidraw MCP, editable files and SVG previews.
// SVG is a deterministic vector preview, not a native hand-drawn MCP export.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const p of ['diagrams/exports','diagrams/mcp']) fs.mkdirSync(path.join(root,p),{recursive:true});
const C={service:'#d0bfff',store:'#c3fae8',external:'#ffd8a8',info:'#a5d8ff',good:'#b2f2bb',note:'#fff3bf'};
const scenes={}; let es=[],seq=0;
function title(text,sub){es=[];seq=0;txt(40,25,text,32);txt(40,74,sub,21);}
function txt(x,y,text,size=22){const e={type:'text',id:`t${++seq}`,x,y,width:Math.max(...text.split('\n').map(l=>l.length))*size*.56,height:text.split('\n').length*size*1.25,text,fontSize:size,strokeColor:'#1e293b'};es.push(e);return e;}
function box(id,x,y,w,h,text,kind='service',size=22){const e={type:kind==='external'?'ellipse':'rectangle',id,x,y,width:w,height:h,backgroundColor:C[kind],strokeColor:'#334155',strokeWidth:2,roughness:0,fillStyle:'solid',label:{text,fontSize:size}};if(kind!=='store'&&kind!=='external')e.roundness={type:3};es.push(e);return e;}
function arr(x,y,dx,dy,label='',async=false,points){const e={type:'arrow',id:`a${++seq}`,x,y,width:Math.abs(dx),height:Math.abs(dy),points:points||[[0,0],[dx,dy]],strokeColor:async?'#7c3aed':'#334155',strokeWidth:2,strokeStyle:async?'dashed':'solid',endArrowhead:'arrow',roughness:0};es.push(e);if(label){const mx=x+dx/2,my=y+dy/2;txt(mx-label.length*5.7,my-29,label,20);}return e;}
function save(name){scenes[name]=[{type:'cameraUpdate',width:1600,height:1200,x:0,y:0},...es];}

title('Carieeer | Requirements','Product commitments • Measurable targets • Proposed, not benchmarked');
box('f1',40,145,470,225,'CANDIDATE\nProfile, skills, experience, education\nGoals and portfolio\nJob discovery and saved jobs\nRetry-safe applications','info');
box('f2',560,145,470,225,'EMPLOYER\nCompany and recruiter roles\nDraft / publish / close jobs\nConsented candidate discovery\nControlled hiring pipeline','info');
box('f3',1080,145,470,225,'GROWTH & ENGAGEMENT\nBlack-box ranked matches\nTarget-role skill gaps\nRoadmaps and milestones\nIn-app / email / push preferences','info');
box('n1',40,425,470,225,'CORE QUALITY\n99.9% core API availability\np95 reads <200 ms\np95 apply / status <300 ms\n~930 peak public requests/s','good');
box('n2',560,425,470,225,'TRUTH & FRESHNESS\nOne application / candidate / job\nValid versioned status changes\nSearch p95 freshness <=60 s\nMatch p95 freshness <=15 min','good');
box('n3',1080,425,470,225,'PROTECTION & RECOVERY\nTenant scope + candidate consent\nSingle-AZ acknowledged RPO 0\nRegional RPO <=5 min\nRegional RTO <=60 min','good');
box('n4',40,705,730,170,'OPERABILITY\nOutbox + dedupe + bounded retries + quarantine\nTrace request through background work\nAlert on queue age, freshness and API SLO burn','note');
box('n5',820,705,730,170,'MAINTAINABILITY\nOne modular backend; separate worker pools\nDomain-owned tables and versioned contracts\nExpand / contract migrations; restore drills','note');
box('s',40,930,1510,160,'SCOPE DECISIONS\nApplied > Screened > Interview > Offer; Rejected from the first three stages\nOffer and Rejected are terminal. No reapplication to the same job.\nMatching / analysis algorithms, scheduling, hiring acceptance and billing are outside scope.','service');
save('requirements');

title('Carieeer | Relational data model','Every card is a PostgreSQL entity or explicitly named entity group. Labels state cardinality.');
box('user',40,145,285,145,'User\nid PK\nOIDC issuer + subject UQ','store');
box('candidate',455,145,370,145,'CandidateProfile\nuser_id PK / FK User\nvisibility • version','store');
arr(325,215,130,0,'1 : 0..1');
box('children',955,130,595,185,'Education • Experience • PortfolioItem\nCareerGoal • FileObject (owned by User)\nCandidateSkill(candidate_id, skill_id) PK\nEach profile child has candidate_id FK','store');
arr(825,215,130,0,'1 : 0..N');
box('employer',40,385,285,150,'Employer membership\n(user_id, company_id) PK\nrole • active','store');
arr(180,290,0,95,'1 : N');
box('company',455,385,370,150,'Company\nid PK\nname • verified • version','store');
arr(325,460,130,0,'N : 1');
box('job',955,385,595,150,'Job\nid PK • company_id FK • state • version\nJobSkill(job_id, skill_id) PK\nSkill joins both CandidateSkill and JobSkill','store');
arr(825,460,130,0,'1 : N');
box('app',40,635,580,175,'Application\nid PK • candidate_id FK • job_id FK\nUQ(candidate_id, job_id) • status • version\nFK(job_id, company_id) • snapshot','store');
box('history',755,635,795,175,'ApplicationStatusHistory\n(application_id, version) PK • actor_id FK User\nfrom_status • to_status • changed_at\nAppend-only; initial Applied entry is version 1','store');
arr(620,720,135,0,'1 : 1..N');
txt(40,570,'Candidate 1:N Application; Job 1:N Application; Candidate N:M Job via SavedJob',22);
box('matches',40,890,470,185,'MatchSet → Match (1 : 0..100)\nCandidate 1:N versioned MatchSets\nMatch.job_id → Job (N : 1)\nActive generation pointer on profile\nUQ(set_id, job_id) and (set_id, rank)','store',21);
box('growth',560,890,470,185,'TargetRole → TargetRoleSkill (1:N)\nCareerGoal N:1 TargetRole\nCandidate / Role 1:N SkillGap\nSkillGap 1:N Roadmap\nRoadmap 1:N Milestone','store',21);
box('notice',1080,890,470,185,'User 1:N Notification / Preference\nNotification 1:N Delivery\nUQ(user, event, category)\nOutboxEvent • ConsumerInbox\nIdempotencyRecord • RecomputeTask','store',21);
txt(40,1110,'DB = truth. Redis / OpenSearch are projections; file bytes are private object storage. Full columns: docs/data-model.md',21);
save('data-model');

title('Carieeer | API boundaries','REST /v1 • Authenticated identity • Cursor lists <=100 • Errors carry code + request_id');
box('clients',40,145,1510,130,'Browser / mobile candidate and employer clients\nOIDC + PKCE login; cookie CSRF protection; current resource authorization','external',23);
arr(795,275,0,80,'HTTPS');
box('api',40,355,1510,130,'BACKEND CONTRACT\nIdempotency-Key on commands (24 h) • If-Match on updates (428 missing / 412 stale)\nSame key + changed request = 409 • Hidden resource = 404 • Quota = 429','service');
box('profileapi',40,555,470,205,'IDENTITY / TALENT / COMPANY\nGET /me   PATCH /me/profile\nPOST /me/files + complete\nPOST /companies\nPUT /companies/{id}/employers/{uid}','info',21);
box('jobapi',560,555,470,205,'JOBS / DISCOVERY / MATCHES\nPOST /companies/{id}/jobs\nPOST /jobs/{id}/publish or close\nGET /search/jobs or candidates\nGET /me/matches; POST .../refresh','info',21);
box('appapi',1080,555,470,205,'APPLICATIONS / PIPELINE\nPOST /jobs/{id}/applications\nGET /me/applications\nGET /jobs/{id}/applications\nPATCH /applications/{id}/status','info',21);
arr(275,485,0,70);arr(795,485,0,70);arr(1315,485,0,70);
box('careerapi',40,825,470,220,'CAREER GROWTH\nGET /target-roles\nPOST /me/skill-gaps\nGET /me/tasks/{id}\nPOST /me/roadmaps\nPATCH .../milestones/{id}','info',21);
box('notifyapi',560,825,470,220,'NOTIFICATIONS / SAVES\nGET /me/notifications\nPUT .../{id}/read\nGET / PUT notification-preferences\nGET /me/saved-jobs\nPUT / DELETE .../{job_id}','info',21);
box('rules',1080,825,470,220,'COMMAND OUTCOMES\nApply: 201, duplicate/closed: 409\nStatus: 200, invalid move: 422\nAsync work: 202 + owned task ID\nEngine never runs in a GET\nValid transitions in docs/api-design.md','note',21);
txt(40,1100,'Lower cards are additional routes on the same backend. Requests, responses and access rules: docs/api-design.md',21);
save('api-design');

title('Carieeer | Architecture','Rounded = component   Square = storage   Ellipse = client/external   Solid = sync   Dashed = async');
box('client',40,145,310,125,'Web / mobile\nCandidates • Employers','external');
box('edge',485,145,390,125,'HTTPS edge / gateway\nWAF • rate limits • routing');
arr(350,205,135,0);
box('identity',1080,145,470,125,'External identity provider\nOIDC / PKCE','external');
arr(875,205,205,0,'login');
box('backend',40,365,1510,195,'MODULAR BACKEND API (one deployment)\nAccess | Talent profiles | Employers / Jobs | Applications\nDiscovery / Matching | Skill gap / Roadmap | Notifications / Preferences\nOwn domain tables; compose hiring writes inside one local transaction','service',24);
arr(680,270,0,95);
box('pg',40,665,410,140,'PostgreSQL HA\nTruth + results + outbox\nSynchronous zonal standby','store');
box('search',535,665,300,140,'OpenSearch\nDerived discovery','store');
box('redis',920,665,260,140,'Redis\nDisposable cache','store');
box('object',1265,665,285,140,'Private object store\nResumes / portfolio','store');
arr(240,560,0,105);arr(685,560,0,105);arr(1050,560,0,105);arr(1400,560,0,105);
box('relay',40,895,260,110,'Outbox relay\nPublish + confirm');
arr(170,805,0,90);
box('bus',380,895,265,110,'RabbitMQ\nQuorum work queues');
arr(300,950,80,0,'',true);
box('worker',730,895,455,110,'Background worker pools\nIndex • Match • Career • Notify');
arr(645,950,85,0,'',true);
arr(760,895,-310,-120,'',false,[[0,0],[0,-50],[-285,-50],[-285,-120],[-310,-120]]);
arr(805,895,0,-90);
box('external',1270,895,280,110,'Black-box engines\nEmail / push providers','external',21);
arr(1185,950,85,0);
txt(40,1050,'Worker effects: PostgreSQL results / inbox; OpenSearch upserts; file scanning. DB effects can emit new outbox events.',21);
box('obs',40,1100,1510,65,'OBSERVABILITY ACROSS ALL COMPONENTS: traces • API SLOs • queue age • freshness • lock waits • audit logs','note',21);
save('architecture');

title('Carieeer | Critical flows','Solid = synchronous call / transaction write   Dashed = asynchronous scheduling or delivery');
txt(40,130,'A. Job publication: commit first; indexing and matching consume independently',25);
box('publish',40,190,350,120,'Recruiter publishes job\nAuth + If-Match + validation');
box('jobtx',510,190,475,120,'PostgreSQL transaction\nJob + version + Outbox + receipt','store');
arr(390,250,120,0);
box('broker',1105,190,445,120,'Relay → RabbitMQ\nConfirmed durable delivery');
arr(985,250,120,0,'',true);
box('indexer',1105,400,445,115,'Indexing worker → OpenSearch\nDB snapshot + version guard');
arr(1325,310,0,90,'',true);
box('matchworker',510,400,475,115,'Matching worker → black-box engine\nBounded inputs • request ID • retry');
arr(1200,310,-455,90,'',true,[[0,0],[0,35],[-455,35],[-455,90]]);
box('result',40,400,350,115,'Persist complete MatchSet\nDB active pointer + outbox','store');
arr(510,460,-120,0);
box('matchnotify',40,595,1510,90,'MatchSetReady → broker → notification planner → inbox / preference-controlled email or push','service');
arr(215,515,0,80,'',true);
txt(40,735,'B. Candidate application: no engine, search or notification call inside the transaction',25);
box('apply',40,800,350,140,'Apply + Idempotency-Key\nAuthenticate candidate\nValidate owned clean resume');
box('applytx',510,790,475,160,'PostgreSQL transaction\nJob SHARE lock + open check\nUNIQUE(candidate, job) insert\nApplication + history + outbox + receipt','store',21);
arr(390,865,120,0);
box('applynotify',1105,800,445,140,'Relay → broker → notifications\nPlanner dedupe; send later\nProvider retry / unknown / DLQ');
arr(985,865,120,0,'',true);
box('outcomes',40,1010,735,125,'HTTP after commit: 201 Applied\nSame-key retry: original response\nDifferent-key duplicate / closed job: 409','note');
box('state',825,1010,725,125,'Pipeline: Applied → Screened → Interview → Offer\nRejected from Applied / Screened / Interview\nVersion CAS + history + outbox on every change','note');
save('flows');

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function native(scene){let out=[];for(const [i,e] of scene.filter(e=>e.type!=='cameraUpdate').entries()){
  const n={angle:0,strokeColor:'#1e293b',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:2,strokeStyle:'solid',roughness:0,opacity:100,groupIds:[],frameId:null,roundness:null,seed:i+1,version:1,versionNonce:i+10,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,...e};delete n.label;
  if(e.type==='text')Object.assign(n,{fontFamily:2,textAlign:'left',verticalAlign:'top',containerId:null,originalText:e.text,autoResize:true,lineHeight:1.25});
  if(e.type==='arrow')Object.assign(n,{startBinding:null,endBinding:null,startArrowhead:null,elbowed:false});
  if(e.label){const size=e.label.fontSize,lines=e.label.text.split('\n'),h=lines.length*size*1.25,w=Math.max(...lines.map(l=>l.length))*size*.53;
    n.boundElements=[{id:e.id+'-label',type:'text'}];out.push(n);
    out.push({...n,type:'text',id:e.id+'-label',x:e.x+(e.width-w)/2,y:e.y+(e.height-h)/2,width:w,height:h,backgroundColor:'transparent',roundness:null,boundElements:null,text:e.label.text,fontSize:size,fontFamily:2,textAlign:'center',verticalAlign:'middle',containerId:e.id,originalText:e.label.text,autoResize:true,lineHeight:1.25});
  } else out.push(n);
}return {type:'excalidraw',version:2,source:'https://excalidraw.com',elements:out,appState:{viewBackgroundColor:'#ffffff',gridSize:null},files:{}};}
function svg(scene){let body=['<rect width="1600" height="1200" fill="white"/>'];
  const text=(x,y,s,size,anchor='start')=>s.split('\n').map((line,i)=>`<text x="${x}" y="${y+i*size*1.25}" dominant-baseline="hanging" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}" fill="#1e293b">${esc(line)}</text>`).join('');
  for(const e of scene){if(e.type==='cameraUpdate')continue;
    if(e.type==='text')body.push(text(e.x,e.y,e.text,e.fontSize));
    else if(e.type==='arrow'){body.push(`<polyline points="${e.points.map(([x,y])=>`${x+e.x},${y+e.y}`).join(' ')}" fill="none" stroke="${e.strokeColor}" stroke-width="2" ${e.strokeStyle==='dashed'?'stroke-dasharray="9 7"':''} marker-end="url(#${e.strokeStyle==='dashed'?'async':'sync'})"/>`);}
    else {body.push(e.type==='ellipse'?`<ellipse cx="${e.x+e.width/2}" cy="${e.y+e.height/2}" rx="${e.width/2}" ry="${e.height/2}" fill="${e.backgroundColor}" stroke="#334155" stroke-width="2"/>`:`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.roundness?14:0}" fill="${e.backgroundColor}" stroke="#334155" stroke-width="2"/>`);
      if(e.label){const size=e.label.fontSize;body.push(text(e.x+e.width/2,e.y+(e.height-e.label.text.split('\n').length*size*1.25)/2,e.label.text,size,'middle'));}}
  }return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200" role="img"><title>Carieeer system design</title><defs>${['sync','async'].map((id,i)=>`<marker id="${id}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="${i?'#7c3aed':'#334155'}"/></marker>`).join('')}</defs>${body.join('\n')}</svg>`;
}
for(const [name,scene] of Object.entries(scenes)){
 fs.writeFileSync(path.join(root,`diagrams/mcp/${name}.json`),JSON.stringify(scene,null,2)+'\n');
 fs.writeFileSync(path.join(root,`diagrams/${name}.excalidraw`),JSON.stringify(native(scene),null,2)+'\n');
 fs.writeFileSync(path.join(root,`diagrams/exports/${name}.svg`),svg(scene));
}
console.log(`Generated ${Object.keys(scenes).length} scene inputs, editable files and SVG previews.`);
