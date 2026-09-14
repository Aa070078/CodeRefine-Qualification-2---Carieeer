// Real PostgreSQL semantics via embedded PGlite. Not a multi-session load test.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const reject=async(sql,pattern)=>{await assert.rejects(db.exec(sql),pattern);checks++;};
await db.exec(fs.readFileSync(new URL('../docs/schema-core.sql',import.meta.url),'utf8'));
await db.exec(`INSERT INTO app_user VALUES ('${id(1)}'); INSERT INTO candidate_profile VALUES ('${id(1)}'); INSERT INTO company VALUES ('${id(2)}'),('${id(3)}'); INSERT INTO job(id,company_id,state) VALUES ('${id(4)}','${id(2)}','Published');`);
const insert=(n,status='Applied',company=id(2))=>`INSERT INTO application(id,candidate_id,job_id,company_id,status,snapshot) VALUES ('${id(n)}','${id(1)}','${id(4)}','${company}','${status}','{}')`;
await reject(insert(5,'Offer'),/must start/);
await reject(insert(5,'Applied',id(3)),/foreign key/);
await db.exec(insert(5));
await reject(insert(6),/unique constraint/);
await reject(`UPDATE application SET status='Offer',version=2 WHERE id='${id(5)}'`,/invalid application/);
await reject(`UPDATE application SET status='Screened',version=3 WHERE id='${id(5)}'`,/invalid application/);
await db.exec(`INSERT INTO application_status_history VALUES ('${id(5)}',1,NULL,'Applied','${id(1)}',NULL,now())`);
await reject(`UPDATE application_status_history SET to_status='Offer'`,/append-only/);
await reject(`DELETE FROM application_status_history`,/append-only/);
await db.exec(`BEGIN; UPDATE application SET status='Screened',version=2 WHERE id='${id(5)}'; INSERT INTO application_status_history VALUES ('${id(5)}',2,'Applied','Screened','${id(1)}',NULL,now()); ROLLBACK;`);
assert.equal((await db.query('SELECT status FROM application')).rows[0].status,'Applied');checks++;
assert.equal((await db.query('SELECT count(*)::int AS n FROM application_status_history')).rows[0].n,1);checks++;
for(const [version,state] of [[2,'Screened'],[3,'Interview'],[4,'Offer']]){
 const r=await db.query(`UPDATE application SET status=$1,version=$2 WHERE id=$3 AND version=$4 RETURNING id`,[state,version,id(5),version-1]);assert.equal(r.rows.length,1);checks++;
}
assert.equal((await db.query(`UPDATE application SET status='Rejected',version=2 WHERE id=$1 AND version=1 RETURNING id`,[id(5)])).rows.length,0);checks++;
await reject(`UPDATE application SET status='Rejected',version=5 WHERE id='${id(5)}'`,/invalid application/);
await reject(`UPDATE application SET snapshot='{"changed":true}',version=5 WHERE id='${id(5)}'`,/immutable application/);
await db.close();console.log(`PASS: ${checks} PostgreSQL kernel checks (constraints, transitions, stale CAS, rollback, history immutability). Concurrency/load tests are not claimed.`);
