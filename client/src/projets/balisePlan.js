// @ts-nocheck
/* Éditeur de plan d'implantation 2D / maquette 3D, repris tel quel de l'artefact « Balise
 * événementielle » (code d'origine en JavaScript, sans typage). Le composant PlanImplantation.tsx
 * lui fournit le contexte : lecture et enregistrement via l'API, dépôt du fond de plan, messages. */
export const BalisePlan = (() => {
/* Catalogue : dimensions réelles en mètres, rattachement au stock (a) */
const CAT = {
  barriere:{l:"Barrières Vauban",a:"a01",line:true,col:"#7D8A98",g:"stock",hint:"Tracez une ligne : 1 barrière tous les 2 m"},
  tente:{l:"Tente 3×3",a:"a05",w:3,h:3,col:"#D99A0B",g:"stock"},
  podium:{l:"Podium",a:"a02",w:6,h:4,col:"#6B4E9B",g:"stock",area:true,res:true},
  table:{l:"Table",a:"a03",w:1.8,h:0.8,col:"#9C6B45",g:"stock"},
  chaise:{l:"Chaise",a:"a04",w:0.5,h:0.5,col:"#9C6B45",g:"stock"},
  grille:{l:"Grille d'exposition",a:"a06",w:1.2,h:0.15,col:"#56687A",g:"stock"},
  sono:{l:"Kit sonorisation",a:"a07",w:1.2,h:1.2,col:"#2F3A46",g:"stock"},
  groupe:{l:"Groupe électrogène",a:"a08",w:2.5,h:1.2,col:"#B8322A",g:"stock"},
  conteneur:{l:"Conteneur à déchets",a:"a09",w:1.2,h:1,col:"#2C7A4B",g:"stock"},
  scene:{l:"Scène",w:10,h:8,col:"#6B4E9B",g:"zone",res:true,zone:true},
  public:{l:"Zone public",w:25,h:18,col:"#1C5DA8",g:"zone",res:true,zone:true,capa:true},
  buvette:{l:"Buvette",w:6,h:3,col:"#D96C2C",g:"zone",res:true,zone:true},
  wc:{l:"Sanitaires",w:3,h:2.5,col:"#4F86B5",g:"zone",res:true,zone:true},
  secours:{l:"Poste de secours",w:6,h:5,col:"#C8302A",g:"securite",res:true,zone:true},
  pompiers:{l:"Voie pompiers",w:30,h:4,col:"#C8302A",g:"securite",res:true,zone:true,hatch:true},
  issue:{l:"Issue de secours",w:4,h:1,col:"#1F9A52",g:"securite",res:true},
  texte:{l:"Étiquette",w:8,h:2,col:"#13202F",g:"zone",res:true,text:true}
};
const GROUPS = [["stock","Matériel du stock"],["zone","Zones"],["securite","Sécurité"]];
const round = (v,s=0.25)=>Math.round(v/s)*s;
const clone = o=>JSON.parse(JSON.stringify(o));
const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nid = ()=>Math.random().toString(36).slice(2,9);
const fr = (n,d=0)=>Number(n).toLocaleString("fr-FR",{maximumFractionDigits:d});
const len = it=>Math.hypot(it.x2-it.x1,it.y2-it.y1);
const defaultDoc = ()=>({bounds:{w:80,h:50},items:[],bg:null,densite:2});

let P=null;

/* ---------- Quantités et capacité ---------- */
function counts(doc){
  const c={};
  for(const it of doc.items){ const d=CAT[it.k]; if(!d||!d.a) continue;
    const n = it.k==="barriere" ? Math.ceil(len(it)/2) : d.area ? it.w*it.h : 1;
    c[d.a]=(c[d.a]||0)+n; }
  for(const k in c) c[k]=Math.ceil(c[k]);
  return c;
}
function capacity(doc){
  const surf=doc.items.filter(i=>CAT[i.k]?.capa).reduce((n,i)=>n+i.w*i.h,0);
  return {surf, capa:Math.floor(surf*(Number(doc.densite)||0)), issues:doc.items.filter(i=>i.k==="issue").length, issuesW:doc.items.filter(i=>i.k==="issue").reduce((n,i)=>n+i.w,0)};
}

/* ---------- Rendu SVG (partagé : éditeur, fiche prestataire, export) ---------- */
function itemSVG(it,pal){
  const d=CAT[it.k]; if(!d) return "";
  if(it.k==="barriere"){
    return `<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${d.col}" stroke-width="0.35" stroke-dasharray="1.85 0.15" data-id="${it.id}" style="cursor:move"/>`;
  }
  const w=it.w,h=it.h,op=d.zone?0.16:0.85;
  let inner=`<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" fill="${d.hatch?"url(#hatch)":d.text?"none":d.col}" fill-opacity="${d.hatch?1:op}" stroke="${d.text?"none":d.col}" stroke-width="${d.zone?0.15:0.06}" ${it.k==="public"?'stroke-dasharray="0.8 0.4"':""}/>`;
  if(it.k==="tente") inner+=`<path d="M${-w/2} ${-h/2}L${w/2} ${h/2}M${w/2} ${-h/2}L${-w/2} ${h/2}" stroke="#fff" stroke-opacity=".7" stroke-width="0.06"/>`;
  if(it.k==="issue") inner+=`<path d="M${-w*0.3} 0H${w*0.3}M${w*0.12} ${-h*0.3}L${w*0.3} 0L${w*0.12} ${h*0.3}" stroke="#fff" stroke-width="${Math.min(0.15,h*0.12)}" fill="none"/>`;
  const lab = it.lab || (d.zone||d.text||it.k==="podium"||it.k==="tente"?d.l:"");
  if(lab && (w>=2.5||d.text)){
    const fs=Math.max(0.35,Math.min(d.text?h*0.6:2.2,Math.min(w,h)*0.22,w/(lab.length*0.55)));
    inner+=`<text x="0" y="${fs*0.35}" text-anchor="middle" font-size="${fs}" font-family="Source Sans 3, Arial, sans-serif" font-weight="700" fill="${d.zone||d.text?pal.ink:"#fff"}" style="pointer-events:none">${esc(lab)}</text>`;
  }
  return `<g transform="translate(${it.x} ${it.y}) rotate(${it.r||0})" data-id="${it.id}" style="cursor:move">${inner}</g>`;
}
function defsSVG(pal){
  return `<defs>
  <pattern id="g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="${pal.line}" stroke-width="0.03"/></pattern>
  <pattern id="g10" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#g1)"/><path d="M10 0H0V10" fill="none" stroke="${pal.line}" stroke-width="0.09"/></pattern>
  <pattern id="hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="#C8302A" fill-opacity=".12"/><path d="M0 0V1.2" stroke="#C8302A" stroke-width="0.35" stroke-opacity=".55"/></pattern>
  </defs>`;
}
function sceneSVG(doc,pal,opts={}){
  const b=doc.bounds;
  let s=defsSVG(pal)+`<rect x="0" y="0" width="${b.w}" height="${b.h}" fill="${pal.surface}"/>`;
  if(doc.bg && !opts.noBg) s+=`<image href="${esc(doc.bg.url)}" x="0" y="0" width="${b.w}" height="${b.h}" opacity="${doc.bg.op??0.85}" preserveAspectRatio="none"/>`;
  if(!doc.bg || opts.grid) s+=`<rect x="0" y="0" width="${b.w}" height="${b.h}" fill="url(#g10)"/>`;
  s+=`<rect x="0" y="0" width="${b.w}" height="${b.h}" fill="none" stroke="${pal.line}" stroke-width="0.2"/>`;
  const order=it=>CAT[it.k]?.zone?0:it.k==="barriere"?2:1;
  s+=doc.items.slice().sort((a,c)=>order(a)-order(c)).map(it=>itemSVG(it,pal)).join("");
  return s;
}
function staticSVG(doc){
  if(!doc) return "";
  return `<svg viewBox="-2 -2 ${doc.bounds.w+4} ${doc.bounds.h+4}" style="width:100%;height:auto;display:block;background:var(--surface-2);border-radius:8px" role="img" aria-label="Plan d'implantation">${sceneSVG(doc,{ink:"var(--ink)",surface:"var(--surface)",line:"var(--line)"})}</svg>`;
}

/* ---------- Montage de l'éditeur ---------- */
function mount(root,ctx){
  unmount();
  P={root,ctx,doc:null,versions:[],sel:null,tool:"select",mode:"2d",view:null,snap:true,calib:null,drag:null,dirty:false,t:null,busy:false,again:false,unsub:null,three:null,panel:null,loaded:false};
  root.innerHTML=shell();
  bind();
  if(ctx.db){
    P.unsub=ctx.db.collection("events/"+ctx.evId+"/plans").onSnapshot(s=>{
      const vs=[]; let cur=null;
      s.docs.forEach(d=>{ if(d.id==="courant") cur=d.data(); else vs.push({...d.data(),_id:d.id}); });
      P.versions=vs.sort((a,b)=>(b.creeLe||"").localeCompare(a.creeLe||""));
      if(!P.dirty && !P.drag){ P.doc = cur ? clone(cur) : (P.doc||defaultDoc()); }
      if(!P.loaded){ P.loaded=true; fit(); }
      draw(); side(); versions();
    },()=>{ ctx.toast("Plan indisponible pour le moment."); });
  } else { P.doc=ctx.demoPlan?clone(ctx.demoPlan):defaultDoc(); P.loaded=true; fit(); draw(); side(); versions(); }
}
function unmount(){
  if(!P) return;
  if(P.unsub) P.unsub();
  if(P.t){ clearTimeout(P.t); flushSave(); }
  stop3D();
  P=null;
}
const mountedFor=()=>P?P.ctx.evId:null;

function shell(){
  const pal=Object.entries(CAT);
  return `<div class="plan">
  <div class="plan-bar panel">
    <div class="seg" role="group" aria-label="Outil">
      <button data-pa="tool" data-v="select" aria-pressed="true">Sélection</button>
      <button data-pa="tool" data-v="barriere" aria-pressed="false">Ligne de barrières</button>
      <button data-pa="tool" data-v="calib" aria-pressed="false">Étalonner</button>
    </div>
    <div class="seg" role="group" aria-label="Vue"><button data-pa="mode" data-v="2d" aria-pressed="true">Plan 2D</button><button data-pa="mode" data-v="3d" aria-pressed="false">Maquette 3D</button></div>
    <label class="btn file-btn">Fond de plan (PDF, image)<input type="file" id="pl-file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden></label>
    <label class="small muted row" style="gap:6px"><input type="checkbox" id="pl-snap" checked> Magnétisme 25 cm</label>
    <span class="grow"></span>
    <button data-pa="fit">Recentrer</button>
    <button data-pa="freeze">Figer une version</button>
    <button data-pa="export" class="primary">Exporter en PNG</button>
  </div>
  <div class="plan-panel" id="pl-panel" hidden></div>
  <div class="plan-body">
    <aside class="panel plan-pal" aria-label="Éléments à poser">${GROUPS.map(([g,l])=>`<div class="pal-g"><div class="eyebrow">${l}</div>${pal.filter(([,d])=>d.g===g).map(([k,d])=>`<button class="pal-i" data-pa="add" data-v="${k}" title="${esc(d.hint||d.l)}"><i style="background:${d.hatch?"repeating-linear-gradient(45deg,"+d.col+" 0 3px,transparent 3px 6px)":d.col}${d.zone?";opacity:.55":""}"></i>${d.l}</button>`).join("")}</div>`).join("")}</aside>
    <div class="plan-stage panel" id="pl-stage" tabindex="0" aria-label="Plan d'implantation, flèches pour déplacer, Suppr pour supprimer, R pour pivoter">
      <svg id="pl-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      <div id="pl-3d" hidden></div>
      <div class="plan-hint small" id="pl-hint"></div>
      <div class="plan-scale mono small" id="pl-scale"></div>
    </div>
    <aside class="plan-side stack"><section class="panel pad" id="pl-insp"></section><section class="panel pad" id="pl-sum"></section><section class="panel pad" id="pl-ver"></section></aside>
  </div></div>`;
}

/* ---------- Vue et coordonnées ---------- */
function fit(){
  const b=P.doc.bounds, st=P.root.querySelector("#pl-stage"); const r=st.getBoundingClientRect();
  const ar=(r.width||800)/(r.height||500); const m=Math.max(b.w,b.h)*0.05;
  let w=b.w+2*m, h=b.h+2*m; if(w/h<ar) w=h*ar; else h=w/ar;
  P.view={x:b.w/2-w/2,y:b.h/2-h/2,w,h};
}
function pt(e){ const svg=P.root.querySelector("#pl-svg"); const p=svg.createSVGPoint(); p.x=e.clientX;p.y=e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function toLocal(it,p){ const a=-(it.r||0)*Math.PI/180, dx=p.x-it.x, dy=p.y-it.y; return {x:dx*Math.cos(a)-dy*Math.sin(a), y:dx*Math.sin(a)+dy*Math.cos(a)}; }
const byId=id=>P.doc.items.find(i=>i.id===id);

function draw(){
  if(!P||!P.doc) return;
  const svg=P.root.querySelector("#pl-svg"); const v=P.view||(fit(),P.view);
  svg.setAttribute("viewBox",`${v.x} ${v.y} ${v.w} ${v.h}`);
  let s=sceneSVG(P.doc,{ink:"var(--ink)",surface:"var(--surface)",line:"var(--line)"});
  const it=P.sel&&byId(P.sel); const hr=v.w/110;
  if(it){
    if(it.k==="barriere") s+=`<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" fill="none" style="pointer-events:none"/>`+
      [["p1",it.x1,it.y1],["p2",it.x2,it.y2]].map(([h,x,y])=>`<circle cx="${x}" cy="${y}" r="${hr}" fill="var(--surface)" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" data-h="${h}" style="cursor:crosshair"/>`).join("");
    else { const res=CAT[it.k].res; s+=`<g transform="translate(${it.x} ${it.y}) rotate(${it.r||0})"><rect x="${-it.w/2}" y="${-it.h/2}" width="${it.w}" height="${it.h}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <line x1="0" y1="${-it.h/2}" x2="0" y2="${-it.h/2-hr*3}" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle cx="0" cy="${-it.h/2-hr*3}" r="${hr}" fill="var(--accent)" data-h="rot" style="cursor:grab"/>
      ${res?`<rect x="${it.w/2-hr}" y="${it.h/2-hr}" width="${hr*2}" height="${hr*2}" fill="var(--surface)" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" data-h="res" style="cursor:nwse-resize"/>`:""}</g>`; }
  }
  if(P.calib) s+=P.calib.pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="${hr*0.8}" fill="var(--signal)" stroke="var(--ink)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("")+(P.calib.pts.length===2?`<line x1="${P.calib.pts[0].x}" y1="${P.calib.pts[0].y}" x2="${P.calib.pts[1].x}" y2="${P.calib.pts[1].y}" stroke="var(--signal)" stroke-width="2" vector-effect="non-scaling-stroke"/>`:"");
  svg.innerHTML=s;
  const hint={select:"Glissez un élément pour le déplacer · molette pour zoomer · glisser le fond pour se déplacer",barriere:"Cliquez-glissez pour tracer une ligne de barrières (1 barrière = 2 m)",calib:"Cliquez deux points dont vous connaissez la distance réelle (une façade, une largeur de voie…)"}[P.tool];
  P.root.querySelector("#pl-hint").textContent=hint;
  // barre d'échelle
  const st=P.root.querySelector("#pl-stage"); const pxPerM=st.clientWidth/v.w; const nice=[1,2,5,10,20,50,100,200].find(n=>n*pxPerM>=70)||200;
  P.root.querySelector("#pl-scale").innerHTML=`<span style="display:inline-block;width:${Math.round(nice*pxPerM)}px;height:6px;border:2px solid var(--ink);border-top:0;vertical-align:middle"></span> ${nice} m`;
}

/* ---------- Panneaux latéraux ---------- */
function side(){
  if(!P||!P.doc) return;
  const it=P.sel&&byId(P.sel); const ins=P.root.querySelector("#pl-insp");
  if(!it){
    const b=P.doc.bounds;
    ins.innerHTML=`<h3>Terrain</h3>${P.doc.bg?`<p class="small muted">Fond de plan importé : ${fr(b.w,1)} × ${fr(b.h,1)} m. ${P.doc.bg.calibre?"Échelle étalonnée.":"<b>Échelle à étalonner</b> avant de poser le matériel."}</p>
      <label class="f">Opacité du fond<input type="range" id="pl-op" min="0.2" max="1" step="0.05" value="${P.doc.bg.op??0.85}"></label><button class="ghost danger" data-pa="rmbg">Retirer le fond de plan</button>`:
      `<p class="small muted">Sans fond de plan, travaillez sur une grille de 1 m. Importez un PDF ou une photo aérienne pour dessiner sur le lieu réel.</p>
      <div class="row"><label class="f">Largeur (m)<input type="number" id="pl-bw" class="w-num" min="10" value="${b.w}"></label><label class="f">Profondeur (m)<input type="number" id="pl-bh" class="w-num" min="10" value="${b.h}"></label></div>`}
      <p class="small muted" style="margin-bottom:0">Sélectionnez un élément pour le modifier.</p>`;
  } else if(it.k==="barriere"){
    const n=Math.ceil(len(it)/2);
    ins.innerHTML=`<h3>Ligne de barrières</h3><p class="mono">${fr(len(it),1)} m · ${n} barrière${n>1?"s":""}</p>
      <label class="f">Libellé<input id="pl-lab" value="${esc(it.lab||"")}" placeholder="Ex. filtrage entrée nord"></label>
      <div class="row"><button data-pa="dup">Dupliquer</button><button class="danger" data-pa="del">Supprimer</button></div>`;
  } else {
    const d=CAT[it.k];
    ins.innerHTML=`<h3>${esc(d.l)}</h3>
      <label class="f">Libellé<input id="pl-lab" value="${esc(it.lab||"")}" placeholder="${esc(d.l)}"></label>
      <div class="row">${d.res?`<label class="f">Largeur (m)<input type="number" step="0.1" min="0.2" id="pl-w" class="w-num" value="${+it.w.toFixed(2)}"></label><label class="f">Profondeur (m)<input type="number" step="0.1" min="0.2" id="pl-h" class="w-num" value="${+it.h.toFixed(2)}"></label>`:`<span class="small muted mono">${it.w} × ${it.h} m</span>`}
      <label class="f">Rotation (°)<input type="number" step="5" id="pl-r" class="w-num" value="${Math.round(it.r||0)}"></label></div>
      ${d.area?`<p class="small mono" style="margin:0">Surface : ${fr(it.w*it.h,1)} m²</p>`:""}
      ${d.capa?`<p class="small mono" style="margin:0">Surface : ${fr(it.w*it.h)} m² · ${fr(it.w*it.h*(P.doc.densite||0))} personnes</p>`:""}
      ${!d.res?`<details><summary class="small" style="cursor:pointer;font-weight:600">Multiplier en rangées</summary><div class="row" style="margin-top:8px"><label class="f">Rangées<input type="number" id="pl-mr" min="1" value="5" class="w-num"></label><label class="f">Par rangée<input type="number" id="pl-mc" min="1" value="10" class="w-num"></label><label class="f">Espacement (m)<input type="number" id="pl-ms" step="0.1" min="0" value="${it.k==="chaise"?0.4:1}" class="w-num"></label></div><button data-pa="grid" style="margin-top:8px">Créer les rangées</button></details>`:""}
      <div class="row"><button data-pa="dup">Dupliquer</button><button data-pa="rot90">Pivoter 90°</button><button class="danger" data-pa="del">Supprimer</button></div>`;
  }
  // Synthèse
  const c=counts(P.doc), ev=P.ctx.getEvent(), arts=P.ctx.articles(); const cap=capacity(P.doc);
  const rows=arts.filter(a=>c[a.id]||(ev.materiel||[]).some(m=>m.a===a.id&&m.q));
  const res=a=>(ev.materiel.find(m=>m.a===a.id)||{}).q||0;
  const diffs=rows.some(a=>(c[a.id]||0)!==res(a));
  const jauge=Number(ev.jauge)||0;
  P.root.querySelector("#pl-sum").innerHTML=`<h3>Synthèse du plan</h3>
  ${rows.length?`<div class="tbl-wrap"><table class="small"><thead><tr><th>Article</th><th class="num">Plan</th><th class="num">Réservé</th><th class="num">Stock</th></tr></thead><tbody>${rows.map(a=>{const n=c[a.id]||0;return `<tr><td>${esc(a.nom)}</td><td class="num mono">${n}</td><td class="num mono" ${n!==res(a)?'style="color:var(--warn);font-weight:700"':""}>${res(a)}</td><td class="num mono" ${n>a.total?'style="color:var(--crit);font-weight:700"':""}>${a.total}</td></tr>`}).join("")}</tbody></table></div>
  ${diffs&&P.ctx.pilot?`<button data-pa="apply" style="margin-top:8px">Reporter dans la réservation matériel</button>`:""}`:`<p class="small muted">Aucun matériel du stock posé.</p>`}
  <div style="margin-top:14px" class="stack"><div class="row sb"><b class="small">Capacité théorique</b><label class="small muted">Densité <input type="number" id="pl-dens" step="0.5" min="0.5" value="${P.doc.densite}" class="w-num" style="width:64px"> pers./m²</label></div>
  ${cap.surf?`<p class="mono" style="margin:0">${fr(cap.surf)} m² → <b>${fr(cap.capa)} personnes</b></p>${jauge?(jauge>cap.capa?`<div class="alert crit small"><div>La jauge prévue (${fr(jauge)}) dépasse la capacité des zones public dessinées.</div></div>`:`<div class="alert info small"><div>Jauge prévue : ${fr(jauge)}, soit ${Math.round(jauge*100/cap.capa)} % de la capacité dessinée.</div></div>`):""}`:`<p class="small muted" style="margin:0">Dessinez une « Zone public » pour estimer la capacité.</p>`}
  <p class="small muted" style="margin:0">Issues de secours dessinées : ${cap.issues}${cap.issues?` (${fr(cap.issuesW,1)} m cumulés)`:""}. Valeurs indicatives : la capacité retenue est celle du dossier de sécurité.</p></div>`;
}
function versions(){
  if(!P) return; const el=P.root.querySelector("#pl-ver");
  el.innerHTML=`<h3>Versions figées</h3>${P.versions.length?P.versions.map(v=>`<div class="ver"><div><b>${esc(v.label)}</b><div class="small muted">${P.ctx.fmtD(v.creeLe)} · ${v.items.length} éléments</div></div><div class="row"><button class="ghost" data-pa="vexp" data-v="${v._id}">PNG</button>${P.ctx.pilot?`<button class="ghost" data-pa="vres" data-v="${v._id}">Restaurer</button>`:""}</div></div>`).join(""):`<p class="small muted" style="margin:0">Figez une version à chaque réunion jalon (T-90, T-30, T-15) pour garder l'historique.</p>`}`;
}
function panel(html){ const p=P.root.querySelector("#pl-panel"); if(!html){p.hidden=true;p.innerHTML="";return;} p.innerHTML=html; p.hidden=false; p.querySelector("input")?.focus(); }

/* ---------- Enregistrement ---------- */
function save(){
  if(!P) return; P.dirty=true; clearTimeout(P.t);
  P.t=setTimeout(flushSave,600);
}
async function flushSave(){
  if(!P) return; P.t=null;
  if(!P.ctx.db){ P.dirty=false; return; }
  if(P.busy){P.again=true;return;}
  P.busy=true; const ctx=P.ctx, data={...clone(P.doc),maj:ctx.today};
  try{ await ctx.db.doc("events/"+ctx.evId+"/plans/courant").set(data); }
  catch(e){ ctx.toast(e.code==="invalid_argument"?"Modification du plan réservée au service événementiel.":"Enregistrement du plan impossible, réessayez."); }
  if(!P) return; P.busy=false;
  if(P.again){P.again=false;flushSave();} else if(!P.t) P.dirty=false;
}
function commit(){ draw(); side(); save(); }

/* ---------- Interactions ---------- */
function bind(){
  const root=P.root, svg=root.querySelector("#pl-svg"), stage=root.querySelector("#pl-stage");
  svg.addEventListener("pointerdown",e=>{
    if(!P.doc) return; stage.focus({preventScroll:true});
    const p=pt(e), h=e.target.closest("[data-h]"), g=e.target.closest("[data-id]");
    svg.setPointerCapture(e.pointerId);
    if(P.tool==="calib"){ if(P.calib.pts.length>=2) P.calib.pts=[]; P.calib.pts.push({x:p.x,y:p.y}); draw(); if(P.calib.pts.length===2) calibPanel(); return; }
    if(P.tool==="barriere"){ const x=P.snap?round(p.x):p.x,y=P.snap?round(p.y):p.y; const it={id:nid(),k:"barriere",x1:x,y1:y,x2:x,y2:y}; P.doc.items.push(it); P.sel=it.id; P.drag={m:"p2",id:it.id,created:true}; draw(); return; }
    if(h && P.sel){ P.drag={m:h.dataset.h,id:P.sel}; return; }
    if(g){ const it=byId(g.dataset.id); P.sel=it.id;
      P.drag = it.k==="barriere" ? {m:"moveline",id:it.id,sx:p.x,sy:p.y,o:{...it}} : {m:"move",id:it.id,dx:p.x-it.x,dy:p.y-it.y};
      draw(); side(); return; }
    P.sel=null; P.drag={m:"pan",cx:e.clientX,cy:e.clientY,v:{...P.view}}; draw(); side();
  });
  svg.addEventListener("pointermove",e=>{
    const D=P&&P.drag; if(!D) return;
    if(D.m==="pan"){ const st=stage.getBoundingClientRect(); const k=P.view.w/st.width; P.view.x=D.v.x-(e.clientX-D.cx)*k; P.view.y=D.v.y-(e.clientY-D.cy)*k; draw(); return; }
    const p=pt(e), it=byId(D.id); if(!it) return; const sn=v=>P.snap?round(v):v;
    if(D.m==="move"){ it.x=sn(p.x-D.dx); it.y=sn(p.y-D.dy); }
    else if(D.m==="moveline"){ const dx=sn(p.x-D.sx),dy=sn(p.y-D.sy); it.x1=D.o.x1+dx;it.x2=D.o.x2+dx;it.y1=D.o.y1+dy;it.y2=D.o.y2+dy; }
    else if(D.m==="p1"){ it.x1=sn(p.x);it.y1=sn(p.y); }
    else if(D.m==="p2"){ it.x2=sn(p.x);it.y2=sn(p.y); }
    else if(D.m==="rot"){ let a=Math.atan2(p.y-it.y,p.x-it.x)*180/Math.PI+90; if(P.snap) a=Math.round(a/5)*5; it.r=((a%360)+360)%360; }
    else if(D.m==="res"){ const l=toLocal(it,p); it.w=Math.max(0.3,sn(Math.abs(l.x)*2)); it.h=Math.max(0.3,sn(Math.abs(l.y)*2)); }
    D.moved=true; draw();
  });
  const up=()=>{ const D=P&&P.drag; if(!D) return; P.drag=null;
    if(D.m==="pan") return;
    const it=byId(D.id);
    if(D.created && it && len(it)<0.5){ P.doc.items=P.doc.items.filter(i=>i!==it); P.sel=null; draw(); side(); return; }
    if(D.moved||D.created) commit(); };
  svg.addEventListener("pointerup",up); svg.addEventListener("pointercancel",up);
  svg.addEventListener("wheel",e=>{ e.preventDefault(); const p=pt(e); const f=e.deltaY>0?1.15:1/1.15; const v=P.view;
    const nw=Math.min(Math.max(v.w*f,4),Math.max(P.doc.bounds.w,P.doc.bounds.h)*4); const k=nw/v.w;
    P.view={x:p.x-(p.x-v.x)*k,y:p.y-(p.y-v.y)*k,w:nw,h:v.h*k}; draw(); },{passive:false});
  stage.addEventListener("keydown",e=>{
    if(!P||P.mode!=="2d") return; const it=P.sel&&byId(P.sel);
    if(e.key==="Escape"){ P.sel=null; setTool("select"); draw(); side(); return; }
    if(!it) return;
    const step=e.shiftKey?1:0.1; const mv=(dx,dy)=>{ if(it.k==="barriere"){it.x1+=dx;it.x2+=dx;it.y1+=dy;it.y2+=dy;} else {it.x+=dx;it.y+=dy;} };
    const map={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
    if(map[e.key]){ e.preventDefault(); mv(...map[e.key]); commit(); }
    else if(e.key==="Delete"||e.key==="Backspace"){ e.preventDefault(); act("del"); }
    else if(e.key==="r"||e.key==="R"){ if(it.k!=="barriere"){ it.r=((it.r||0)+15)%360; commit(); } }
    else if((e.ctrlKey||e.metaKey)&&e.key==="d"){ e.preventDefault(); act("dup"); }
  });
  root.addEventListener("click",e=>{ const b=e.target.closest("[data-pa]"); if(!b||!root.contains(b)) return; act(b.dataset.pa,b.dataset.v); });
  root.addEventListener("change",e=>{
    const el=e.target, it=P.sel&&byId(P.sel);
    if(el.id==="pl-file" && el.files[0]){ importBg(el.files[0]); el.value=""; return; }
    if(el.id==="pl-snap"){ P.snap=el.checked; return; }
    if(el.id==="pl-dens"){ P.doc.densite=Number(el.value)||0; commit(); return; }
    if(el.id==="pl-bw"||el.id==="pl-bh"){ P.doc.bounds[el.id==="pl-bw"?"w":"h"]=Math.max(10,Number(el.value)||10); fit(); commit(); return; }
    if(el.id==="pl-op"&&P.doc.bg){ P.doc.bg.op=Number(el.value); commit(); return; }
    if(!it) return;
    if(el.id==="pl-lab"){ it.lab=el.value; commit(); }
    if(el.id==="pl-w") { it.w=Math.max(0.2,Number(el.value)||it.w); commit(); }
    if(el.id==="pl-h") { it.h=Math.max(0.2,Number(el.value)||it.h); commit(); }
    if(el.id==="pl-r") { it.r=((Number(el.value)||0)%360+360)%360; commit(); }
  });
  root.addEventListener("input",e=>{ if(e.target.id==="pl-op"&&P.doc.bg){ P.doc.bg.op=Number(e.target.value); draw(); } });
  new ResizeObserver(()=>{ if(P&&P.mode==="2d"&&P.doc) draw(); if(P&&P.three) P.three.resize(); }).observe(stage);
}
function setTool(t){ P.tool=t; P.calib=t==="calib"?{pts:[]}:null; P.root.querySelectorAll('[data-pa="tool"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===t)); if(t!=="calib") panel(null); draw(); }

function act(a,v){
  const it=P.sel&&byId(P.sel), ctx=P.ctx;
  switch(a){
    case "tool": if(P.mode==="3d") setMode("2d"); setTool(v); break;
    case "mode": setMode(v); break;
    case "fit": fit(); draw(); break;
    case "add": { if(P.mode==="3d") setMode("2d"); const d=CAT[v]; const c={x:round(P.view.x+P.view.w/2),y:round(P.view.y+P.view.h/2)};
      if(d.line){ setTool("barriere"); ctx.toast("Tracez la ligne de barrières sur le plan"); break; }
      const n={id:nid(),k:v,x:c.x,y:c.y,w:d.w,h:d.h,r:0}; P.doc.items.push(n); P.sel=n.id; setTool("select"); commit(); P.root.querySelector("#pl-stage").focus({preventScroll:true}); break; }
    case "del": if(it){ P.doc.items=P.doc.items.filter(i=>i!==it); P.sel=null; commit(); } break;
    case "dup": if(it){ const n={...clone(it),id:nid()}; if(n.k==="barriere"){n.x1+=2;n.x2+=2;n.y1+=2;n.y2+=2;} else {n.x+=1;n.y+=1;} P.doc.items.push(n); P.sel=n.id; commit(); } break;
    case "rot90": if(it){ it.r=((it.r||0)+90)%360; commit(); } break;
    case "grid": if(it){ const R=Math.min(60,Math.max(1,+P.root.querySelector("#pl-mr").value||1)), C=Math.min(60,Math.max(1,+P.root.querySelector("#pl-mc").value||1)), sp=Math.max(0,+P.root.querySelector("#pl-ms").value||0);
      const a=(it.r||0)*Math.PI/180, ux={x:Math.cos(a),y:Math.sin(a)}, uy={x:-Math.sin(a),y:Math.cos(a)};
      for(let r=0;r<R;r++) for(let c=0;c<C;c++){ if(!r&&!c) continue; const dx=c*(it.w+sp), dy=r*(it.h+sp); P.doc.items.push({...clone(it),id:nid(),x:+(it.x+ux.x*dx+uy.x*dy).toFixed(3),y:+(it.y+ux.y*dx+uy.y*dy).toFixed(3)}); }
      ctx.toast(`${R*C} ${CAT[it.k].l.toLowerCase()}s en place`); commit(); } break;
    case "rmbg": P.doc.bg=null; commit(); break;
    case "apply": { const c=counts(P.doc); ctx.applyQuantities(c); side(); ctx.toast("Réservation matériel mise à jour d'après le plan"); break; }
    case "freeze": { const lab=`${ctx.currentJalon()} · plan du ${ctx.fmtD(ctx.today)}`;
      panel(`<form class="row" id="pl-fz"><label class="f" style="flex:1 1 260px">Nom de la version<input id="pl-fzl" value="${esc(lab)}" required></label><button class="primary" type="submit">Figer</button><button type="button" data-pa="close">Annuler</button></form>`);
      P.root.querySelector("#pl-fz").addEventListener("submit",async e=>{ e.preventDefault(); const label=P.root.querySelector("#pl-fzl").value; panel(null);
        const data={...clone(P.doc),label,creeLe:ctx.today};
        if(ctx.db){ try{ await ctx.db.collection("events/"+ctx.evId+"/plans").doc("v"+Date.now()).set(data); ctx.toast("Version figée"); }catch(err){ ctx.toast(err.code==="quota_exceeded"?"Nombre maximal de documents atteint.":"Impossible de figer la version."); } }
        else { P.versions.unshift({...data,_id:"v"+Date.now()}); versions(); ctx.toast("Version figée"); } });
      break; }
    case "close": panel(null); if(P.tool==="calib") setTool("select"); break;
    case "vres": { const ver=P.versions.find(x=>x._id===v); if(!ver) break;
      panel(`<div class="row"><span>Remplacer le plan courant par <b>${esc(ver.label)}</b> ? Le plan courant n'est pas conservé s'il n'a pas été figé.</span><button class="primary" data-pa="vres-ok" data-v="${v}">Restaurer</button><button data-pa="close">Annuler</button></div>`); break; }
    case "vres-ok": { const ver=P.versions.find(x=>x._id===v); if(!ver) break; const d=clone(ver); delete d._id; delete d.label; delete d.creeLe; P.doc={...defaultDoc(),...d}; P.sel=null; panel(null); fit(); commit(); ctx.toast("Version restaurée"); break; }
    case "vexp": { const ver=P.versions.find(x=>x._id===v); if(ver) exportPNG(ver,ver.label); break; }
    case "export": exportPNG(P.doc,"Plan de travail du "+ctx.fmtD(ctx.today)); break;
    case "calib-ok": applyCalib(); break;
  }
}

/* ---------- Étalonnage ---------- */
function calibPanel(){
  const [a,b]=P.calib.pts; const d=Math.hypot(b.x-a.x,b.y-a.y);
  panel(`<form class="row" id="pl-cf"><span class="small">Distance mesurée sur le plan : <b class="mono">${fr(d,2)} m</b>.</span><label class="f">Distance réelle (m)<input type="number" id="pl-cd" step="0.01" min="0.1" required class="w-num"></label><button class="primary" type="submit">Appliquer l'échelle</button><button type="button" data-pa="close">Annuler</button></form>`);
  P.root.querySelector("#pl-cf").addEventListener("submit",e=>{ e.preventDefault(); applyCalib(); });
}
function applyCalib(){
  const real=Number(P.root.querySelector("#pl-cd")?.value); const [a,b]=P.calib.pts; const d=Math.hypot(b.x-a.x,b.y-a.y);
  if(!real||!d) return; const f=real/d;
  P.doc.bounds={w:+(P.doc.bounds.w*f).toFixed(2),h:+(P.doc.bounds.h*f).toFixed(2)};
  if(P.doc.bg){ P.doc.bg.mpp*=f; P.doc.bg.calibre=true; }
  for(const it of P.doc.items){ if(it.k==="barriere"){ it.x1*=f;it.y1*=f;it.x2*=f;it.y2*=f; } else { it.x*=f; it.y*=f; } }
  panel(null); setTool("select"); fit(); commit(); P.ctx.toast(`Échelle appliquée : le terrain mesure ${fr(P.doc.bounds.w)} × ${fr(P.doc.bounds.h)} m`);
}

/* ---------- Import du fond de plan ---------- */
function loadScript(src){ return new Promise((res,rej)=>{ if(document.querySelector(`script[src="${src}"]`)) return res(); const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("script")); document.head.appendChild(s); }); }
function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin="anonymous"; i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
async function importBg(file){
  const ctx=P.ctx;
  if(ctx.db && !ctx.assets){ ctx.toast("L'import de fond de plan est réservé aux éditeurs du service."); return; }
  if(file.size>40e6){ ctx.toast("Fichier trop lourd (40 Mo maximum)."); return; }
  panel(`<div class="row"><span>Préparation du fond de plan…</span></div>`);
  try{
    let blob=file,w,h;
    if(file.type==="application/pdf"){
      // DK Événementiel : pdf.js est fourni par l'application (ctx.chargerPdf) plutôt que par un CDN.
      await ctx.chargerPdf();
      const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      const page=await pdf.getPage(1); const v0=page.getViewport({scale:1}); const sc=Math.min(4,3000/Math.max(v0.width,v0.height));
      const vp=page.getViewport({scale:sc}); const cv=document.createElement("canvas"); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
      const c2=cv.getContext("2d"); c2.fillStyle="#fff"; c2.fillRect(0,0,cv.width,cv.height);
      await page.render({canvasContext:c2,viewport:vp}).promise;
      blob=await new Promise(r=>cv.toBlob(r,"image/png")); w=cv.width; h=cv.height;
    } else { const u=URL.createObjectURL(file); const img=await loadImg(u); w=img.naturalWidth; h=img.naturalHeight; URL.revokeObjectURL(u); }
    let url,id=null;
    if(ctx.assets){ const r=await ctx.assets.upload(blob); url=r.url; id=r.id; } else url=URL.createObjectURL(blob);
    if(!P) return;
    const mpp=100/w; // largeur provisoire de 100 m, à étalonner
    P.doc.bg={id,url,wPx:w,hPx:h,mpp,op:0.85,calibre:false,nom:file.name};
    P.doc.bounds={w:+(w*mpp).toFixed(2),h:+(h*mpp).toFixed(2)};
    panel(null); fit(); commit(); setTool("calib");
    ctx.toast("Fond importé. Étalonnez l'échelle en cliquant deux points de distance connue.");
  }catch(e){ panel(null); ctx.toast(e&&e.code==="too_large"?"Fichier trop lourd pour être stocké.":e&&e.code==="unsupported_type"?"Format non pris en charge : utilisez un PDF, PNG ou JPEG.":e&&e.message?e.message:"Import impossible. Vérifiez le fichier et réessayez."); }
}

/* ---------- Export PNG pour dossier ---------- */
async function exportPNG(doc,label){
  const ctx=P.ctx, ev=ctx.getEvent();
  const pad=48, head=96, sc=Math.max(4,Math.min(24,3200/doc.bounds.w)); const W=Math.round(doc.bounds.w*sc), H=Math.round(doc.bounds.h*sc);
  const c=counts(doc), cap=capacity(doc); const leg=Object.entries(CAT).filter(([k])=>doc.items.some(i=>i.k===k));
  const legRows=Math.ceil(leg.length/3); const legH=60+legRows*28+40;
  const cv=document.createElement("canvas"); cv.width=W+pad*2; cv.height=head+H+pad+legH; const g=cv.getContext("2d");
  const drawAll=async withBg=>{
    g.fillStyle="#fff"; g.fillRect(0,0,cv.width,cv.height);
    g.fillStyle="#13202F"; g.font="700 30px 'Barlow Condensed', Arial"; g.fillText(ev.titre||"Plan d'implantation",pad,44);
    g.font="16px 'Source Sans 3', Arial"; g.fillStyle="#4B5A6B"; g.fillText(`${ctx.fmtD(ev.date)} · ${ev.lieu||""} · ${label}`,pad,72);
    if(withBg&&doc.bg){ const img=await loadImg(doc.bg.url); g.globalAlpha=doc.bg.op??0.85; g.drawImage(img,pad,head,W,H); g.globalAlpha=1; }
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.bounds.w} ${doc.bounds.h}" width="${W}" height="${H}">${sceneSVG(doc,{ink:"#13202F",surface:withBg&&doc.bg?"transparent":"#FFFFFF",line:"#C9D1DA"},{noBg:true,grid:!doc.bg||!withBg})}</svg>`;
    const u=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"})); const im=await loadImg(u); g.drawImage(im,pad,head,W,H); URL.revokeObjectURL(u);
    // échelle
    const nice=[5,10,20,50,100].find(n=>n*sc>=120)||100; const y0=head+H+34;
    g.fillStyle="#13202F"; g.fillRect(pad,y0,nice*sc,6); g.fillStyle="#fff"; g.fillRect(pad+nice*sc/2,y0+1,nice*sc/2-1,4);
    g.fillStyle="#13202F"; g.font="14px 'IBM Plex Mono', monospace"; g.fillText(`0`,pad-3,y0-6); g.fillText(`${nice} m`,pad+nice*sc-16,y0-6);
    g.fillText(`Terrain ${fr(doc.bounds.w)} × ${fr(doc.bounds.h)} m${doc.bg&&!doc.bg.calibre?" · échelle non étalonnée":""}`,pad+nice*sc+30,y0+6);
    // légende
    g.font="15px 'Source Sans 3', Arial";
    leg.forEach(([k,d],i)=>{ const col=i%3, row=Math.floor(i/3); const x=pad+col*Math.max(260,W/3), y=y0+44+row*28;
      g.fillStyle=d.col; g.globalAlpha=d.zone?0.45:1; g.fillRect(x,y-12,18,14); g.globalAlpha=1; g.fillStyle="#13202F";
      const n=d.a?c[d.a]:doc.items.filter(it=>it.k===k).length; g.fillText(`${d.l} : ${n}${d.area?" m²":""}`,x+26,y); });
    g.fillStyle="#4B5A6B"; g.fillText(`Capacité théorique des zones public : ${fr(cap.capa)} personnes (${fr(cap.surf)} m² à ${doc.densite} pers./m²) · Issues de secours : ${cap.issues}`,pad,y0+44+legRows*28+12);
  };
  try{ await drawAll(true); var blob=await new Promise((r,j)=>{ try{ cv.toBlob(r,"image/png"); }catch(e){ j(e); } }); }
  catch(_){ await drawAll(false); blob=await new Promise(r=>cv.toBlob(r,"image/png")); ctx.toast("Fond de plan non exporté : seul le dessin figure sur l'image."); }
  const name=`Plan-${(ev.titre||"evenement").normalize("NFD").replace(/[^\w]+/g,"-").replace(/-+$/,"")}-${ctx.today}.png`;
  if(!ctx.downloads){ ctx.toast("Téléchargement indisponible dans cet affichage."); return; }
  try{ await ctx.downloads.save({filename:name,data:blob}); }
  catch(e){ if(e.code!=="declined") ctx.toast("Export impossible pour le moment."); }
}

/* ---------- Maquette 3D ---------- */
async function setMode(m){
  if(P.mode===m) return; P.mode=m;
  P.root.querySelectorAll('[data-pa="mode"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===m));
  const svg=P.root.querySelector("#pl-svg"), box=P.root.querySelector("#pl-3d");
  if(m==="2d"){ stop3D(); box.hidden=true; svg.style.display=""; P.root.querySelector("#pl-hint").hidden=false; P.root.querySelector("#pl-scale").hidden=false; draw(); return; }
  svg.style.display="none"; box.hidden=false; P.root.querySelector("#pl-scale").hidden=true;
  P.root.querySelector("#pl-hint").textContent="Chargement de la maquette…";
  try{
    // DK Événementiel : three.js est fourni par l'application (ctx.chargerTroisD) plutôt que par un CDN.
    await P.ctx.chargerTroisD();
  }catch(_){ P.root.querySelector("#pl-hint").textContent="La maquette 3D n'a pas pu se charger."; return; }
  if(!P||P.mode!=="3d") return;
  start3D(box);
  P.root.querySelector("#pl-hint").textContent="Glisser pour tourner · clic droit ou deux doigts pour déplacer · molette pour zoomer";
}
function stop3D(){ if(P&&P.three){ cancelAnimationFrame(P.three.raf); P.three.renderer.dispose(); P.three.box.innerHTML=""; P.three=null; } }
function start3D(box){
  const T=window.THREE, doc=P.doc, b=doc.bounds; const css=getComputedStyle(document.documentElement);
  const renderer=new T.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));
  box.innerHTML=""; box.appendChild(renderer.domElement);
  const scene=new T.Scene(); scene.background=new T.Color(css.getPropertyValue("--surface-2").trim()||"#E4E9EE");
  const cam=new T.PerspectiveCamera(45,1,0.1,5000); const D=Math.max(b.w,b.h);
  cam.position.set(b.w/2+D*0.35,D*0.55,b.h/2+D*0.75);
  const ctl=new T.OrbitControls(cam,renderer.domElement); ctl.target.set(b.w/2,0,b.h/2); ctl.maxPolarAngle=Math.PI/2.05; ctl.enableDamping=true; ctl.update();
  scene.add(new T.HemisphereLight(0xffffff,0x8899aa,0.75)); const sun=new T.DirectionalLight(0xffffff,0.7); sun.position.set(b.w*0.2,D,b.h*0.1); scene.add(sun);
  // sol
  const gm=new T.MeshLambertMaterial({color:0xdfe5ea}); const ground=new T.Mesh(new T.PlaneGeometry(b.w,b.h),gm); ground.rotation.x=-Math.PI/2; ground.position.set(b.w/2,0,b.h/2); scene.add(ground);
  if(doc.bg){ new T.TextureLoader().load(doc.bg.url,tx=>{ gm.map=tx; gm.color.set(0xffffff); gm.needsUpdate=true; },undefined,()=>{}); }
  else { const grid=new T.GridHelper(Math.ceil(D/10)*10,Math.ceil(D/10),0x9aa6b2,0xc7d0d8); grid.position.set(b.w/2,0.01,b.h/2); scene.add(grid); }
  const mat={}; const M=(col,op=1)=>{ const k=col+op; return mat[k]||(mat[k]=new T.MeshLambertMaterial({color:col,transparent:op<1,opacity:op})); };
  const add=(geo,m,x,y,z,r)=>{ const o=new T.Mesh(geo,m); o.position.set(x,y,z); o.rotation.y=-(r||0)*Math.PI/180; scene.add(o); return o; };
  for(const it of doc.items){
    const d=CAT[it.k]; if(!d) continue;
    if(it.k==="barriere"){ const L=len(it), n=Math.max(1,Math.ceil(L/2)), ang=Math.atan2(it.y2-it.y1,it.x2-it.x1);
      for(let i=0;i<n;i++){ const t=(i+0.5)/n, seg=L/n; const o=add(new T.BoxGeometry(seg*0.96,1.1,0.05),M(0x9aa3ad,0.85),it.x1+(it.x2-it.x1)*t,0.55,it.y1+(it.y2-it.y1)*t,0); o.rotation.y=-ang; }
      continue; }
    const col=new T.Color(d.col).getHex(), r=it.r;
    switch(it.k){
      case "tente": add(new T.BoxGeometry(it.w,2.1,it.h),M(0xf4f4f0),it.x,1.05,it.y,r); { const roof=add(new T.ConeGeometry(Math.hypot(it.w,it.h)/2,1.1,4),M(col),it.x,2.65,it.y,r); roof.rotation.y+=Math.PI/4; } break;
      case "podium": add(new T.BoxGeometry(it.w,1,it.h),M(col),it.x,0.5,it.y,r); break;
      case "scene": add(new T.BoxGeometry(it.w,1.2,it.h),M(0x3c3150),it.x,0.6,it.y,r); { const a=(r||0)*Math.PI/180; add(new T.BoxGeometry(it.w,6,0.3),M(0x2a2238),it.x-Math.sin(a)*(-it.h/2),3.6,it.y+Math.cos(a)*(-it.h/2),r); } break;
      case "table": add(new T.BoxGeometry(it.w,0.75,it.h),M(col),it.x,0.375,it.y,r); break;
      case "chaise": add(new T.BoxGeometry(it.w*0.9,0.45,it.h*0.9),M(0x5a6470),it.x,0.225,it.y,r); break;
      case "grille": add(new T.BoxGeometry(it.w,2,Math.max(0.05,it.h/3)),M(col,0.8),it.x,1,it.y,r); break;
      case "sono": add(new T.BoxGeometry(it.w,1.8,it.h),M(col),it.x,0.9,it.y,r); break;
      case "groupe": add(new T.BoxGeometry(it.w,1.4,it.h),M(col),it.x,0.7,it.y,r); break;
      case "conteneur": add(new T.BoxGeometry(it.w,1.2,it.h),M(col),it.x,0.6,it.y,r); break;
      case "buvette": case "wc": case "secours": add(new T.BoxGeometry(it.w,2.5,it.h),M(col,0.9),it.x,1.25,it.y,r); break;
      case "issue": add(new T.BoxGeometry(it.w,0.04,it.h),M(col),it.x,0.03,it.y,r); add(new T.BoxGeometry(Math.min(1.2,it.w*0.4),0.5,0.08),M(col),it.x,2.4,it.y,r); break;
      case "texte": break;
      default: { const o=add(new T.PlaneGeometry(it.w,it.h),M(col,0.35),it.x,0.03,it.y,0); o.rotation.x=-Math.PI/2; o.rotation.z=-(r||0)*Math.PI/180; }
    }
  }
  const resize=()=>{ const w=box.clientWidth,h=box.clientHeight||400; renderer.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix(); };
  resize();
  const loop=()=>{ if(!P||!P.three) return; ctl.update(); renderer.render(scene,cam); P.three.raf=requestAnimationFrame(loop); };
  P.three={renderer,box,resize,raf:0}; loop();
}

return {mount,unmount,mountedFor,staticSVG,counts,CAT};
})();
