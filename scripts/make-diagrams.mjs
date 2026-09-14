import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('diagrams');
fs.mkdirSync(root, { recursive: true });
let next = 1;

const base = (type, id, x, y, width, height, extra = {}) => ({
  type, id, x, y, width, height, strokeColor: '#1e1e1e',
  backgroundColor: extra.backgroundColor || '#ffffff', fillStyle: 'solid',
  strokeWidth: 2, roughness: 0, opacity: 100, seed: next++, version: 1,
  versionNonce: next++, isDeleted: false, groupIds: [], frameId: null,
  updated: Date.now(), link: null, locked: false, ...extra,
});

const text = (id, x, y, value, size = 20) => base('text', id, x, y, Math.max(140, value.length * size * 0.55), size * 1.4, {
  text: value, originalText: value, fontSize: size, fontFamily: 2, textAlign: 'left', verticalAlign: 'top',
  autoResize: true, lineHeight: 1.25, backgroundColor: 'transparent', containerId: null,
});

const box = (id, x, y, width, height, value, color) => base('rectangle', id, x, y, width, height, {
  roundness: { type: 3 }, backgroundColor: color, label: { text: value, fontSize: 20 },
});

const arrow = (id, x, y, dx, dy) => base('arrow', id, x, y, dx, dy, {
  points: [[0, 0], [dx, dy]], endArrowhead: 'arrow', startArrowhead: null,
});

const scene = (title, elements) => ({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements: [text('title', 40, 25, title, 28), ...elements], appState: { viewBackgroundColor: '#ffffff' }, files: {} });
const out = (name, value) => fs.writeFileSync(path.join(root, `${name}.excalidraw`), JSON.stringify(value, null, 2) + '\n');

out('requirements', scene('Carieeer - Requirements', [
  box('candidate', 60, 130, 300, 250, 'Candidate\nProfile, skills\nSearch and apply', '#a5d8ff'),
  box('employer', 450, 130, 300, 250, 'Employer\nCompany and jobs\nReview applications', '#a5d8ff'),
  box('growth', 840, 130, 300, 250, 'Growth\nMatches, skill gaps\nRoadmap, notifications', '#a5d8ff'),
  box('quality', 250, 460, 700, 90, 'Quality\nFast, private, available, no duplicate applications', '#b2f2bb'),
]));

out('data-model', scene('Carieeer - Data model', [
  box('user', 50, 130, 200, 80, 'User\nSupabase Auth', '#c3fae8'),
  box('profile', 330, 130, 250, 80, 'CandidateProfile', '#c3fae8'),
  box('company', 660, 130, 220, 80, 'Company', '#c3fae8'),
  box('job', 960, 130, 240, 80, 'Job', '#c3fae8'),
  box('application', 250, 330, 300, 90, 'Application\nUNIQUE(candidate, job)', '#c3fae8'),
  box('history', 700, 330, 300, 90, 'StatusHistory', '#c3fae8'),
  box('career', 400, 500, 400, 80, 'Match + SkillGap + Roadmap', '#c3fae8'),
  arrow('a1', 250, 170, 80, 0), arrow('a2', 580, 170, 80, 0), arrow('a3', 880, 170, 80, 0),
  arrow('a4', 550, 375, 150, 0), arrow('a5', 400, 210, -50, 120), arrow('a6', 780, 210, -50, 120),
]));

out('api-design', scene('Carieeer - API', [
  box('auth', 60, 130, 300, 130, 'Auth\nPOST /auth/login\nSupabase Auth', '#a5d8ff'),
  box('profileapi', 450, 130, 300, 130, 'Profile\nPUT /me/profile', '#a5d8ff'),
  box('jobapi', 840, 130, 300, 130, 'Jobs\nPOST /companies/:id/jobs\nGET /jobs', '#a5d8ff'),
  box('matchapi', 250, 380, 300, 130, 'Search / Match\nGET /jobs\nGET /me/matches', '#a5d8ff'),
  box('appapi', 650, 380, 300, 130, 'Applications\nPOST /jobs/:id/applications\nPATCH /applications/:id/status', '#a5d8ff'),
  box('careerapi', 1050, 380, 300, 130, 'Career\nPOST /me/skill-gaps\nPOST /me/roadmaps', '#a5d8ff'),
]));

out('architecture', scene('Carieeer - Architecture', [
  box('client', 60, 130, 260, 80, 'Web / Mobile', '#ffd8a8'),
  box('api', 430, 130, 360, 80, 'Backend API', '#d0bfff'),
  box('auth', 900, 130, 260, 80, 'Supabase Auth', '#ffd8a8'),
  box('db', 90, 330, 300, 100, 'Supabase Database\nPostgreSQL', '#c3fae8'),
  box('storage', 500, 330, 300, 100, 'Supabase Storage\nPrivate files', '#c3fae8'),
  box('workers', 910, 330, 300, 100, 'RabbitMQ + Workers\nMatch / Search / Notify', '#d0bfff'),
  arrow('a1', 320, 170, 110, 0), arrow('a2', 790, 170, 110, 0), arrow('a3', 610, 210, -370, 120),
  arrow('a4', 610, 210, 40, 120), arrow('a5', 610, 210, 450, 120),
]));

out('flows', scene('Carieeer - Main flows', [
  text('h1', 50, 120, 'Publish job', 23),
  box('publish', 50, 170, 260, 80, 'Employer creates job', '#a5d8ff'),
  box('save', 390, 170, 300, 80, 'Save in Supabase DB', '#c3fae8'),
  box('work', 770, 170, 300, 80, 'Workers update search\nand matching', '#d0bfff'),
  arrow('a1', 310, 210, 80, 0), arrow('a2', 690, 210, 80, 0),
  text('h2', 50, 340, 'Apply', 23),
  box('apply', 50, 390, 260, 80, 'Candidate applies', '#a5d8ff'),
  box('protect', 390, 390, 300, 80, 'Transaction + unique rule', '#c3fae8'),
  box('notify', 770, 390, 300, 80, 'Notification later', '#d0bfff'),
  arrow('a3', 310, 430, 80, 0), arrow('a4', 690, 430, 80, 0),
]));

console.log('Created five simple Excalidraw files.');
