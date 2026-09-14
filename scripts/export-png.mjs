import fs from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
for(const name of ['requirements','data-model','api-design','architecture','flows']) {
  const svg=fs.readFileSync(new URL(`../diagrams/exports/${name}.svg`,import.meta.url),'utf8');
  const png=new Resvg(svg,{fitTo:{mode:'width',value:2400},font:{loadSystemFonts:true,defaultFontFamily:'Arial'}}).render().asPng();
  fs.writeFileSync(new URL(`../diagrams/exports/${name}.png`,import.meta.url),png);
}
console.log('Exported five 2400 x 1800 PNG previews from SVG.');
