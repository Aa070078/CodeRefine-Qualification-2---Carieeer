import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve('diagrams');
const out = path.join(root, 'exports');
fs.mkdirSync(out, { recursive: true });
const names = ['requirements', 'data-model', 'api-design', 'architecture', 'flows'];

const esc = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function labelSvg(value, x, y, width, height, fontSize = 20) {
  const lines = String(value || '').split(/\\n|\n/);
  const lineHeight = fontSize + 5;
  const start = y + height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize / 3;
  return lines.map((line, i) => `<text x="${x + width / 2}" y="${start + i * lineHeight}" text-anchor="middle" font-size="${fontSize}" font-family="Arial, sans-serif" fill="#1e1e1e">${esc(line)}</text>`).join('');
}

function makeSvg(scene) {
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1450" height="650" viewBox="0 0 1450 650">',
    '<rect width="1450" height="650" fill="white"/>',
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#1e1e1e"/></marker></defs>',
  ];
  for (const e of scene.elements) {
    if (e.type === 'rectangle') {
      parts.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="10" fill="${e.backgroundColor || '#fff'}" stroke="#1e1e1e" stroke-width="2"/>`);
      if (e.label?.text) parts.push(labelSvg(e.label.text, e.x, e.y, e.width, e.height, e.label.fontSize || 20));
    } else if (e.type === 'text') {
      parts.push(`<text x="${e.x}" y="${e.y + (e.fontSize || 20)}" font-size="${e.fontSize || 20}" font-family="Arial, sans-serif" fill="#1e1e1e">${esc(e.text)}</text>`);
    } else if (e.type === 'arrow') {
      parts.push(`<line x1="${e.x}" y1="${e.y}" x2="${e.x + e.width}" y2="${e.y + e.height}" stroke="#1e1e1e" stroke-width="2" marker-end="url(#arrow)"/>`);
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

for (const name of names) {
  const scene = JSON.parse(fs.readFileSync(path.join(root, `${name}.excalidraw`), 'utf8'));
  const svg = makeSvg(scene);
  fs.writeFileSync(path.join(out, `${name}.svg`), svg);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1450 } }).render().asPng();
  fs.writeFileSync(path.join(out, `${name}.png`), png);
}
console.log('Exported five SVG and PNG diagrams.');
