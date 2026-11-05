// Generates the "Beerlao Premium PNG" icon pack -> public/icons/png/{main-menu,sub-menu,tab-bar,mini,ui}/*.png
const fs=require('fs'),path=require('path');
const G='/home/claude/.npm-global/lib/node_modules/';
const sharp=require(G+'sharp');
const React=require(G+'react');const {renderToStaticMarkup}=require(G+'react-dom/server');
const Fa6=require(G+'react-icons/fa6');
const ROOT='/home/claude/proj/New folder (2)/public';
const OUT=ROOT+'/icons/png';
const X=JSON.parse(fs.readFileSync('/tmp/X.json','utf8'));
const SVGMAP=X.SVG; // key -> "group/name"

function mk(d){fs.mkdirSync(path.dirname(d),{recursive:true})}
// ---------- glyph helpers ----------
function pascal(n){return n.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join('')}
function faGlyph(name){ // -> {vb:[x,y,w,h], inner}
  const comp=Fa6['Fa'+pascal(name)];
  if(comp){const s=renderToStaticMarkup(React.createElement(comp));
    const vb=s.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    const inner=s.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
    return {vb,inner};}
  if(X.FA[name]){return {vb:X.FA[name][0].split(/\s+/).map(Number),inner:X.FA[name][1]}}
  return null;
}
function tGlyph(key){ // nested FA svg inside the old tile table
  const t=X.T[key].replace(/\\"/g,'"');
  const m=t.match(/<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/);
  return {vb:m[1].split(/\s+/).map(Number),inner:m[2]};
}
function recolor(inner,fill){return inner.replace(/fill="[^"]*"/g,'').replace(/<(path|circle|rect|ellipse|polygon)\b/g,'<$1 fill="'+fill+'"')}
function fit(g,box,cx,cy){ // transform string placing glyph in box*box centred at cx,cy
  const [x,y,w,h]=g.vb;const s=box/Math.max(w,h);
  const tx=cx-(x+w/2)*s,ty=cy-(y+h/2)*s;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})`;
}
// ---------- main tile (menu / sub-menu / tab-bar) ----------
function tile(key){
  const g=tGlyph(key);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
<defs>
<linearGradient id="bg" x1="30" y1="10" x2="160" y2="186" gradientUnits="userSpaceOnUse"><stop stop-color="#16B070"/><stop offset=".55" stop-color="#087A45"/><stop offset="1" stop-color="#054F2D"/></linearGradient>
<linearGradient id="rim" x1="20" y1="10" x2="170" y2="186" gradientUnits="userSpaceOnUse"><stop stop-color="#FFE680"/><stop offset=".5" stop-color="#F5C21B"/><stop offset="1" stop-color="#D9A400"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFF1B8"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="cp"><rect x="12" y="10" width="168" height="168" rx="44"/></clipPath>
<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#063D24" flood-opacity=".32"/></filter>
<filter id="gs" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#032a18" flood-opacity=".45"/></filter>
</defs>
<g filter="url(#sh)"><rect x="12" y="10" width="168" height="168" rx="44" fill="url(#bg)"/></g>
<g clip-path="url(#cp)"><ellipse cx="96" cy="-6" rx="120" ry="78" fill="url(#gloss)"/></g>
<rect x="15" y="13" width="162" height="162" rx="41" fill="none" stroke="url(#rim)" stroke-width="7"/>
<rect x="22" y="20" width="148" height="148" rx="35" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>
<g filter="url(#gs)"><g transform="${fit(g,98,96,94)}">${recolor(g.inner,'url(#gl)')}</g></g>
<circle cx="150" cy="38" r="10" fill="url(#rim)" stroke="#FFFFFF" stroke-width="3.5"/>
</svg>`;
  // glyph gradient is objectBoundingBox on each element -> fine for single glyphs
  return svg;
}
// ---------- mini glyph (sticker: gold fill + deep green outline) ----------
const RED=['trash','ban','circle-xmark','triangle-exclamation','circle-exclamation','circle-minus','power-off','right-from-bracket'];
const GRN=['check','check-double','circle-check','square-check','thumbs-up','circle-plus'];
function mini(name){
  const g=faGlyph(name); if(!g) return null;
  const c=RED.includes(name)?['#FF8A80','#D32F2F']:GRN.includes(name)?['#3FD08A','#0D9958']:['#FFE680','#F5B800'];
  const [,,w,h]=g.vb; const s=70/Math.max(w,h); const sw=(6/s).toFixed(1); // 6px outline at 96 canvas
  const inner=g.inner.replace(/fill="[^"]*"/g,'').replace(/<(path|circle|rect|ellipse|polygon|g)\b/g,'<$1');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>
<g transform="${fit(g,70,48,48)}" fill="url(#f)" stroke="#075B35" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke">${inner}</g></svg>`;
}
async function save(svg,file,size){mk(file);await sharp(Buffer.from(svg),{density:300}).resize(size,size).png({compressionLevel:9}).toFile(file)}
(async()=>{
  let n=0,miss=[];
  for(const [key,rel] of Object.entries(SVGMAP)){await save(tile(key),`${OUT}/${rel}.png`,192);n++}
  for(const name of X.MN){
    const s=mini(name);
    if(s){await save(s,`${OUT}/mini/${name}.png`,96);n++}
    else{ // fallback: rasterise the existing premium mini svg
      const f=`${ROOT}/icons/premium/svg/mini/${name}.svg`;mk(`${OUT}/mini/${name}.png`);
      await sharp(f,{density:300}).resize(96,96).png().toFile(`${OUT}/mini/${name}.png`);n++;miss.push(name)}
  }
  for(const f of fs.readdirSync(`${ROOT}/icons/premium/svg/ui`)){
    const o=`${OUT}/ui/${f.replace(/\.svg$/,'.png')}`;mk(o);
    await sharp(`${ROOT}/icons/premium/svg/ui/${f}`,{density:400}).resize(128,128).png().toFile(o);n++}
  console.log('written',n,'fallback',miss);
})();
