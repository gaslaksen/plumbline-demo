import './styles.css';
import { PLAN, WALLS, COUNTS, AREA, ftin, wallLen as wlen, takeoff as calcTakeoff } from './plan.js';
import { ROOMS_WALK } from './viewer/rooms.js';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const money=n=>(n<0?'−$':'$')+Math.abs(Math.round(n)).toLocaleString('en-US');
const money2=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const signed=n=>n===0?'$0':(n>0?'+$':'−$')+Math.abs(Math.round(n)).toLocaleString('en-US');
const getVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#cccccc';

/* ---------- state ---------- */
const S={
  dig:{}, overOnly:false, poSent:false, billDone:false, delay:3, thread:'island', inboxDone:{},
  ho:{tab:'home',signed:false,picked:'b',confirmed:false},
  field:{rec:false,rfi:false,share:true,posted:false},
  plans:{tab:'plan',confirmed:false,mode:'orbit',furnished:true,style:'coastal',lighting:'day',upload:'',
    a:{height:9,spacing:16,ext:'2x6',waste:10,ceilings:true},qty:{},price:{}}
};


/* ---------- views ---------- */
const TOUR=[
  ['plans','Plans to 3D and takeoff','Walk through a furnished 3D model built from a floor plan, then edit the material list it produces.'],
  ['homeowner','Homeowner app','What your clients see: weekly updates, change orders to sign, and selections with the allowance math.'],
  ['budget','Job costing','Estimate, committed and actual cost on every line, plus lender draws and cash in versus cash out.'],
  ['schedule','Schedule','Delay framing a few days and watch later trades, text notices and selection deadlines move.'],
  ['inbox','Client inbox','Texts, email and portal messages in one place, each with a summary of what was asked and decided.'],
  ['field','Field app','A superintendent talks for 30 seconds and gets a finished daily log and an RFI.'],
  ['dashboard','Owner dashboard','Every job’s margin, schedule and cash on one screen, plus a Monday digest.']
];
function vTour(){return `<div class="wrap stack">
  <div class="hero">
    <p class="eyebrow">Prepared for Trifecta Builders · Ocean Isle Beach, NC</p>
    <h1>One job record, from the first set of plans to closeout</h1>
    <p class="lead">Plumbline keeps the plans, budget, selections, schedule and every homeowner conversation on the same job. An assistant called Foreman drafts the paperwork, and nothing goes out until you approve it. This demo runs on a sample job, so click anything.</p>
  </div>
  <h2>Suggested order for the walkthrough</h2>
  <ol class="tour">${TOUR.map((t,i)=>`<li><a class="tour-card${i===0?' tour-first':''}" href="#${t[0]}"><span class="tour-n">${i+1}</span><span><strong>${t[1]}</strong><span>${t[2]}</span></span></a></li>`).join('')}</ol>
  <aside class="card note"><h2>What is live and what is sample</h2><ul>
    <li>The 3D house and the material takeoff are calculated in your browser from the sample floor plan. Change the wall height on the takeoff tab and the 3D walls change too.</li><li>Furniture in the walkthrough is real product models; everything built into the house (cabinets, trim, doors, windows) comes from the plan.</li>
    <li>Reading an uploaded PDF, and Foreman’s messages, are scripted for this demo.</li>
    <li>Job names, people, prices and dates are examples, not Trifecta figures.</li></ul></aside>
  <footer class="credits"><h2>Credits</h2><p>3D furniture from the Khronos glTF Sample Assets: Glam Velvet Sofa and Anisotropy Barn Lamp by Eric Chadwick, © Wayfair, CC BY 4.0; Sheen Wood Leather Sofa and Diffuse Transmission Plant by Eric Chadwick (Darmstadt Graphics Group, CC BY 4.0) from CC0 originals by Fran Calvente and Rico Cilliers; Sheen Chair by Eric Chadwick, © Wayfair, CC0. Sky lighting: Forest Slope by Poly Haven, CC0. Renderer: three.js and N8AO.</p></footer>
</div>`;}

function vPlans(){
  const P=S.plans, t=P.tab;
  const tabs=[['plan','Floor plan'],['3d','3D walkthrough'],['takeoff','Material takeoff']];
  return `<div class="wrap stack">
  <div class="page-head"><div><p class="crumb">Shoreline Drive · Sheet A1.1</p><h1>Plans to 3D and takeoff</h1>
    <p class="sub">Sample plan: 3 bedrooms, 2 baths, ${AREA.toLocaleString()} sq ft heated, covered front porch</p></div>
    <div><label for="plan-file" class="btn btn-ghost">Upload a floor plan</label><input id="plan-file" class="sr-only" type="file" accept=".pdf,image/*" data-input="upload"></div></div>
  ${P.upload?`<div class="card"><strong>${esc(P.upload)}</strong> was opened in your browser only. This demo keeps the sample plan loaded; the live version reads your plan set and asks you to confirm the walls and dimensions before any quantities are used.</div>`:''}
  <section class="foreman" aria-labelledby="fm-plan">
    <p class="kicker">Foreman</p>
    <h2 id="fm-plan">Read sheet A1.1 at 1/4" = 1'-0" from the title block</h2>
    <div class="chips" style="margin-top:10px">
      <span class="chip">${COUNTS.walls} walls</span><span class="chip">${COUNTS.doors} doors</span><span class="chip">${COUNTS.windows} windows</span><span class="chip">${COUNTS.rooms} rooms</span><span class="chip">${PLAN.W}'-0" × ${PLAN.D}'-0"</span></div>
    <div class="row-item" style="margin-top:12px"><p>Check the walls and dimensions against your plans. Quantities stay marked as unconfirmed until you do.</p>
      ${P.confirmed?'<span class="done">Plan confirmed by you</span>':'<button class="btn" data-act="confirmPlan">Confirm plan</button>'}</div>
  </section>
  <div class="seg" role="tablist" aria-label="Plan views">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${t===k}" data-act="plansTab" data-tab="${k}">${l}</button>`).join('')}</div>
  <div>${t==='plan'?vPlanTab():t==='3d'?v3dTab():vTakeoffTab()}</div>
</div>`;}

function vPlanTab(){return `<div class="card"><div class="scroll-x">${planSVG()}</div>
  <p class="muted" style="margin:10px 0 0;font-size:14px">This is what Foreman extracted: wall lines, openings and room names. The 3D model and the takeoff both come from this same geometry, so a correction here fixes both.</p></div>`;}

function planSVG(){
  const k=10, parts=[];
  PLAN.rooms.forEach(r=>{
    parts.push(`<rect class="room" x="${r.x0*k}" y="${r.z0*k}" width="${(r.x1-r.x0)*k}" height="${(r.z1-r.z0)*k}"/>`);
    const cx=(r.x0+r.x1)/2*k, cz=(r.z0+r.z1)/2*k, a=(r.x1-r.x0)*(r.z1-r.z0);
    if(r.id==='hall')parts.push(`<text class="rarea" x="${30*k}" y="${22.4*k}" text-anchor="middle">HALL</text>`);
    else parts.push(`<text class="rname" x="${cx}" y="${cz-2}" text-anchor="middle">${r.name}</text><text class="rarea" x="${cx}" y="${cz+13}" text-anchor="middle">${a} sf</text>`);
  });
  parts.push(`<rect class="porch" x="0" y="${-8*k}" width="${30*k}" height="${8*k}"/><text class="rarea" x="${15*k}" y="${-3.6*k}" text-anchor="middle">COVERED PORCH 30' × 8'</text>`);
  WALLS.forEach(w=>{
    const L=wlen(w),dx=(w.b[0]-w.a[0])/L,dz=(w.b[1]-w.a[1])/L,t=w.ext?0.5:0.4,nx=-dz,nz=dx;
    const P=s=>[(w.a[0]+dx*s)*k,(w.a[1]+dz*s)*k];
    const line=(s0,s1,cls,sw)=>{const p=P(s0),q=P(s1);return `<line class="${cls}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke-width="${sw}"/>`;};
    let c=w.ext?-t/2:0;
    [...w.o].sort((p,q)=>p.at-q.at).forEach(o=>{
      parts.push(line(c,o.at,'wall',t*k));
      if(o.t==='win')parts.push(line(o.at,o.at+o.w,'win',t*k*0.45));
      else{const h=P(o.at),e=P(o.at+o.w),lx=h[0]+nx*o.w*k,lz=h[1]+nz*o.w*k;
        parts.push(`<line class="door" x1="${h[0]}" y1="${h[1]}" x2="${lx}" y2="${lz}" stroke-width="1.6"/><path class="door" d="M${e[0]} ${e[1]} A${o.w*k} ${o.w*k} 0 0 1 ${lx} ${lz}" stroke-width="1" stroke-dasharray="3 3"/>`);}
      c=o.at+o.w;
    });
    parts.push(line(c,w.ext?L+t/2:L,'wall',t*k));
  });
  // dimensions
  const dz=-11*k, dx=-5*k;
  parts.push(`<line class="dim" x1="0" y1="${dz}" x2="${60*k}" y2="${dz}"/><line class="dim" x1="0" y1="${dz-6}" x2="0" y2="${dz+6}"/><line class="dim" x1="${60*k}" y1="${dz-6}" x2="${60*k}" y2="${dz+6}"/><text class="dimt" x="${30*k}" y="${dz-8}" text-anchor="middle">60'-0"</text>`);
  parts.push(`<line class="dim" x1="${dx}" y1="0" x2="${dx}" y2="${34*k}"/><line class="dim" x1="${dx-6}" y1="0" x2="${dx+6}" y2="0"/><line class="dim" x1="${dx-6}" y1="${34*k}" x2="${dx+6}" y2="${34*k}"/><text class="dimt" x="${dx-8}" y="${17*k}" text-anchor="middle" transform="rotate(-90 ${dx-8} ${17*k})">34'-0"</text>`);
  parts.push(`<text class="tb" x="0" y="${37.6*k}">A1.1  FLOOR PLAN  ·  SCALE 1/4" = 1'-0"  ·  SAMPLE</text>`);
  return `<svg class="plan-svg" viewBox="${-9*k} ${-15*k} ${73*k} ${54*k}" role="img" aria-label="Floor plan of the sample house: great room, kitchen and dining across the front, primary suite on the right, two bedrooms, bath and laundry along the back hall.">${parts.join('')}</svg>`;
}


function v3dTab(){
  const P=S.plans, walk=P.mode==='walk';
  const opt=(v,l,cur)=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`;
  return `<div class="card">
  <div class="three-bar">
    <div class="seg" aria-label="Camera">${[['orbit','Dollhouse'],['walk','Walk through']].map(([k,l])=>`<button aria-pressed="${P.mode===k}" data-act="mode" data-m="${k}">${l}</button>`).join('')}</div>
    <div class="opts">
      <label class="check"><input type="checkbox" id="furnished" data-input="furnished" ${P.furnished?'checked':''}> Furnished</label>
      <label class="field-inline" for="finish">Finish <select id="finish" data-input="finish">${opt('coastal','Coastal light',P.style)}${opt('modern','Modern dark',P.style)}</select></label>
      <label class="field-inline" for="lighting">Light <select id="lighting" data-input="lighting">${opt('day','Daylight',P.lighting)}${opt('evening','Evening',P.lighting)}</select></label>
    </div>
  </div>
  <div class="three-stage" id="three-stage">
    <div class="three-load" id="three-load"><span class="spinner" aria-hidden="true"></span>Loading the 3D house…</div>
    <div class="three-help">${walk?'Drag to look around. Use the arrows, or click the view and use W A S D.':'Drag to turn the house. Pinch, scroll, or use + and − to zoom.'}</div>
    ${walk?`<div class="pad" aria-label="Move">
      <span></span><button data-move="f" aria-label="Walk forward">↑</button><span></span>
      <button data-move="tl" aria-label="Turn left">↶</button><button data-move="b" aria-label="Walk back">↓</button><button data-move="tr" aria-label="Turn right">↷</button></div>`
    :`<div class="zoom"><button data-act="zoom" data-z="-1" aria-label="Zoom in">+</button><button data-act="zoom" data-z="1" aria-label="Zoom out">−</button></div>`}
    <div class="photo-bar" id="photo-bar">${photoBar({state:'off'})}</div>
  </div>
  <div class="rooms" aria-label="Jump to a room">${ROOMS_WALK.map(r=>`<button class="btn btn-ghost btn-sm" data-act="room" data-room="${r[0]}">${r[1]}</button>`).join('')}</div>
  <p class="muted" style="margin:10px 0 0;font-size:14px">Built from the plan geometry at ${S.plans.a.height}' walls. <strong style="font-weight:500;color:var(--fg)">Take a photo</strong> re-renders the current view at print resolution with sharper shadows and depth, ready to save and send to a client.</p>
</div>`;}
function photoBar(p){
  if(p.state==='preparing')return `<span class="photo-status">Preparing the render…</span><button class="btn btn-ghost btn-sm on-dark" data-act="photoCancel">Cancel</button>`;
  if(p.state==='rendering'){const pct=Math.round(p.samples/p.target*100);return `<span class="photo-status">Rendering photo · ${pct}%</span><span class="photo-meter" aria-hidden="true"><i style="width:${pct}%"></i></span><button class="btn btn-ghost btn-sm on-dark" data-act="photoCancel">Cancel</button>`;}
  if(p.state==='done')return `<span class="photo-status">Photo ready</span><button class="btn btn-sm" data-act="photoSave">Save image</button><button class="btn btn-ghost btn-sm on-dark" data-act="photoCancel">Back to live view</button>`;
  if(p.state==='error')return `<span class="photo-status">${esc(p.message)}</span>`;
  return `<button class="btn" data-act="photo">Take a photo</button>`;
}

function vTakeoffTab(){
  const a=S.plans.a;
  return `<div class="tk-grid">
  <form class="card form" id="tk-form" aria-labelledby="tk-a-h" onsubmit="return false">
    <h2 id="tk-a-h">Assumptions</h2>
    <label for="tk-height">Wall height (ft)<input id="tk-height" type="number" min="8" max="12" step="1" value="${a.height}" data-input="assume" data-k="height"></label>
    <label for="tk-spacing">Stud spacing<select id="tk-spacing" data-input="assume" data-k="spacing">${[12,16,24].map(v=>`<option value="${v}" ${+a.spacing===v?'selected':''}>${v}" on center</option>`).join('')}</select></label>
    <label for="tk-ext">Exterior wall framing<select id="tk-ext" data-input="assume" data-k="ext">${['2x6','2x4'].map(v=>`<option ${a.ext===v?'selected':''}>${v}</option>`).join('')}</select></label>
    <label for="tk-waste">Waste factor (%)<input id="tk-waste" type="number" min="0" max="30" step="1" value="${a.waste}" data-input="assume" data-k="waste"></label>
    <label class="check" for="tk-ceil"><input id="tk-ceil" type="checkbox" ${a.ceilings?'checked':''} data-input="assume" data-k="ceilings"> Drywall and paint ceilings</label>
    <p class="muted" style="margin:0;font-size:13px">Prices are placeholders. In the real product they come from Trifecta’s cost catalog and supplier quotes.</p>
  </form>
  <div class="card">
    <div class="page-head" style="align-items:center"><h2>Material list from sheet A1.1</h2><span class="muted" style="font-size:13px">Edit any quantity or price. Edited cells are highlighted.</span></div>
    <div class="scroll-x" style="margin-top:8px"><table class="tbl tk"><thead><tr><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead><tbody id="tk-body"></tbody></table></div>
    <div class="tk-foot"><div><div class="muted" style="font-size:13px">Material total, items listed</div><div class="tk-total" id="tk-total"></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" data-act="tkReset">Reset edits</button><button class="btn" data-act="tkSend">Send to estimate</button></div></div>
  </div></div>`;}

function fillTakeoff(){
  const body=$('#tk-body');if(!body)return;
  const rows=calcTakeoff(S.plans.a,S.plans.qty,S.plans.price);let cat='',total=0,html='';
  rows.forEach(r=>{
    if(r.cat!==cat){cat=r.cat;html+=`<tr class="cat"><td colspan="5">${cat}</td></tr>`;}
    const ext=r.qty*r.price;total+=ext;
    html+=`<tr><td>${esc(r.item)}</td>
      <td class="r"><input type="number" min="0" step="1" value="${r.qty}" aria-label="Quantity, ${esc(r.item)}" data-input="qty" data-key="${esc(r.key)}" class="${r.qEdited?'edited':''}" title="Calculated: ${r.calc}"></td>
      <td>${r.unit}</td>
      <td class="r"><input type="number" min="0" step="0.01" value="${Number.isInteger(r.price)?r.price:r.price.toFixed(2)}" aria-label="Unit price, ${esc(r.item)}" data-input="price" data-key="${esc(r.key)}" class="${r.pEdited?'edited':''}"></td>
      <td class="r num">${money(ext)}</td></tr>`;
  });
  body.innerHTML=html;
  $('#tk-total').textContent=money(total);
}

/* dashboard */
const DIGEST=[
  {id:'w',job:'Shoreline Drive',text:'Framing is projected $8,240 over budget. Two lumber bills totaling $6,115 are not matched to a purchase order.',link:'budget',action:'Open budget'},
  {id:'h',job:'Marsh Hen Lane',text:'Kitchen tile selection is due Friday and tile install starts Oct 26. A reminder to the homeowners is drafted.',action:'Send reminder',doneLabel:'Reminder sent'},
  {id:'o',job:'Sea Trail Cottage',text:'Change order #4 ($14,600) was signed Thursday but has not been invoiced. It is drafted into the next draw.',action:'Add to draw',doneLabel:'Added to Draw 6'}
];
const JOBS=[
  ['Shoreline Drive','Framing','+3 days',1,'15.9%',1,'+$23,550',0,'Exterior siding color, due Oct 9'],
  ['Marsh Hen Lane','Drywall','On track',0,'18.6%',0,'+$41,200',0,'Kitchen tile, due Oct 9'],
  ['Causeway Point','Pilings and foundation','+5 days, rain',1,'18.1%',0,'−$3,200',1,'Window package, due Oct 20'],
  ['Sea Trail Cottage','Trim and paint','On track',0,'19.2%',0,'+$12,880',0,'None open'],
  ['Brick Landing Road','Closeout','On track',0,'17.4%',0,'+$31,075',0,'Final walkthrough, Oct 12'],
  ['Harbor Street office fit-out','Preconstruction','Permit pending',1,'20.0% est.',0,'$0',0,'Contract signature']
];
function vDashboard(){return `<div class="wrap stack">
  <div class="page-head"><div><p class="crumb">Monday, October 5</p><h1>Good morning. Three things need you today.</h1></div></div>
  <div class="kpis">
    <div class="card kpi"><div class="label">Active builds</div><div class="val">12</div><div class="note">6 more in the pipeline</div></div>
    <div class="card kpi"><div class="label">Contract value under construction</div><div class="val">$9.4M</div><div class="note">Revised, with change orders</div></div>
    <div class="card kpi"><div class="label">Projected margin, all jobs</div><div class="val warn">17.6%</div><div class="note">Target 18.0%</div></div>
    <div class="card kpi"><div class="label">Waiting on homeowners</div><div class="val">7</div><div class="note">2 due this week</div></div>
  </div>
  <section class="foreman stack" style="gap:10px" aria-labelledby="dg-h"><div><p class="kicker">Foreman</p><h2 id="dg-h">Monday digest</h2></div>
    ${DIGEST.map(d=>`<div class="row-item"><p><strong>${d.job}.</strong> ${d.text}</p>${d.link?`<a class="btn btn-ghost" href="#${d.link}">${d.action}</a>`:S.dig[d.id]?`<span class="done">${d.doneLabel}</span>`:`<button class="btn" data-act="dig" data-id="${d.id}">${d.action}</button>`}</div>`).join('')}
  </section>
  <section class="card" aria-labelledby="jb-h"><h2 id="jb-h">Active jobs</h2>
    <div class="scroll-x" style="margin-top:8px"><table class="tbl" style="min-width:860px"><thead><tr><th>Job</th><th>Phase</th><th>Schedule</th><th class="r">Projected margin</th><th class="r">Cash in minus out</th><th>Next homeowner decision</th></tr></thead><tbody>
    ${JOBS.map(j=>{const m=parseFloat(j[4]);return `<tr><td><strong style="font-weight:500">${j[0]}</strong></td><td class="muted">${j[1]}</td><td><span class="chip${j[3]?' risk':''}">${j[2]}</span></td><td class="r num${m<17?' warn':''}">${j[4]}</td><td class="r num${j[7]?' warn':''}">${j[6]}</td><td class="muted">${j[8]}</td></tr>`;}).join('')}
    </tbody></table></div>
    <p class="muted" style="margin:10px 0 0;font-size:13px">Cash in minus out is lender draws and client payments received, less bills paid. Orange means more has gone out than come in on that job.</p>
  </section></div>`;}

/* budget */
const LINES=[
  ['01-100','Permits and fees',18400,0,18400,18400,18400],
  ['02-200','Site work and pilings',42000,0,44150,44150,44150],
  ['03-300','Foundation',68500,0,68500,68500,67900],
  ['06-100','Framing labor',74000,0,74000,52800,76900],
  ['06-110','Framing lumber (from plan takeoff)',96000,0,96000,70115,101340],
  ['07-200','Roofing',38200,0,38200,0,38200],
  ['08-500','Impact windows and exterior doors',61000,9800,70800,35400,70800],
  ['15-400','Plumbing',52000,0,52000,12000,52000],
  ['16-100','Electrical',47500,7800,55300,9500,55300],
  ['22-300','Allowance: plumbing fixtures',14000,0,0,0,15450],
  ['22-400','Allowance: flooring',28000,0,0,0,26200]
];
function vBudget(){
  const all=LINES.map(r=>({code:r[0],name:r[1],o:r[2],c:r[3],rv:r[2]+r[3],cm:r[4],ac:r[5],pj:r[6],v:r[2]+r[3]-r[6]}));
  const shown=S.overOnly?all.filter(r=>r.v<0):all, sum=k=>shown.reduce((a,r)=>a+r[k],0);
  return `<div class="wrap stack">
  <div class="page-head"><div><p class="crumb">Jobs / Shoreline Drive</p><h1>Shoreline Drive · Budget</h1><p class="sub">Fixed price · Framing phase · Synced with QuickBooks Online 4 minutes ago</p></div>
    <button class="btn btn-ghost" data-act="filter" aria-pressed="${S.overOnly}">${S.overOnly?'Show all lines':'Show only lines over budget'}</button></div>
  <div class="kpis">
    <div class="card kpi"><div class="label">Revised contract</div><div class="val">$1,301,600</div><div class="note">$1,284,000 + 2 change orders</div></div>
    <div class="card kpi"><div class="label">Projected cost</div><div class="val">$1,094,690</div><div class="note">Committed + cost to complete</div></div>
    <div class="card kpi"><div class="label">Projected profit</div><div class="val warn">$206,910</div><div class="note">15.9%, estimated at 18.0%</div></div>
    <div class="card kpi"><div class="label">Cash in minus out</div><div class="val">+$23,550</div><div class="note">$412,000 drawn · $388,450 paid</div></div>
  </div>
  <section class="foreman stack" style="gap:10px" aria-labelledby="bf-h"><div><p class="kicker">Foreman</p><h2 id="bf-h">Two things on this job</h2></div>
    <div class="row-item"><p>12 subcontractor purchase orders are drafted from the estimate for work starting in the next 30 days: roofing, windows, plumbing, electrical and HVAC. Trades accept by text.</p>${S.poSent?'<span class="done">Sent · 0 of 12 accepted so far</span>':'<button class="btn" data-act="sendPos">Review and send 12 POs</button>'}</div>
    <div class="row-item"><p>Two lumber bills ($6,115) match Coastal Lumber PO-1042 by vendor and items but exceed it. Framing is projected $8,240 over: lumber $5,340 and labor $2,900.</p>${S.billDone?'<span class="done">Matched · pushed to QuickBooks</span>':'<button class="btn" data-act="matchBills">Match bills and log the overage</button>'}</div>
  </section>
  <section class="card" aria-labelledby="bt-h"><div class="page-head" style="align-items:baseline"><h2 id="bt-h">Budget to actual</h2><span class="muted" style="font-size:13px">Showing ${shown.length} of 38 cost codes</span></div>
    <div class="scroll-x" style="margin-top:8px"><table class="tbl" style="min-width:980px"><thead><tr><th>Cost code</th><th class="r">Estimate</th><th class="r">Changes</th><th class="r">Revised</th><th class="r">Committed (POs)</th><th class="r">Actual (bills)</th><th class="r">Projected</th><th class="r">Variance</th></tr></thead><tbody>
    ${shown.map(r=>`<tr><td><span class="code">${r.code}</span>${r.name}</td><td class="r num">${money(r.o)}</td><td class="r num muted">${r.c?'+'+money(r.c):'—'}</td><td class="r num">${money(r.rv)}</td><td class="r num">${money(r.cm)}</td><td class="r num">${money(r.ac)}</td><td class="r num">${money(r.pj)}</td><td class="r num${r.v<0?' warn':''}">${signed(r.v)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Subtotal, lines shown</td><td class="r num">${money(sum('o'))}</td><td class="r num">+${money(sum('c'))}</td><td class="r num">${money(sum('rv'))}</td><td class="r num">${money(sum('cm'))}</td><td class="r num">${money(sum('ac'))}</td><td class="r num">${money(sum('pj'))}</td><td class="r num">${signed(sum('v'))}</td></tr></tfoot></table></div>
    <p class="muted" style="margin:10px 0 0;font-size:13px">Allowance lines fill from homeowner selections. Plumbing fixtures are over because of the faucet and tub choices; the change order is drafted.</p>
  </section>
  <section class="card" aria-labelledby="dr-h"><h2 id="dr-h">Lender draws</h2>
    <div class="scroll-x" style="margin-top:8px"><table class="tbl" style="min-width:600px"><thead><tr><th>Draw</th><th>Milestone</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>
    ${[['Draw 1','Pilings and foundation','$96,000','Received Jul 18'],['Draw 2','Floor system','$104,000','Received Aug 22'],['Draw 3','Walls framed','$112,000','Received Sep 19'],['Draw 4','Roof framed','$100,000','Received Oct 1'],['Draw 5','Dried in','$118,000','Request drafted · lien waivers 6 of 7 collected']].map(d=>`<tr><td><strong style="font-weight:500">${d[0]}</strong></td><td>${d[1]}</td><td class="r num">${d[2]}</td><td class="muted">${d[3]}</td></tr>`).join('')}
    </tbody></table></div></section></div>`;}

/* schedule */
function plan(d){const t={};const add=(id,name,trade,dur,preds,fixed)=>{const start=preds.length?Math.max(...preds.map(p=>t[p].end)):fixed;t[id]={id,name,trade,dur,start,end:start+dur};};
  add('fr','Framing','Seaside Framing',15,[],d);add('rf','Roof dry-in','Summit Roofing',5,['fr']);add('wd','Impact windows and doors','Coastal Window Co.',4,['rf']);
  add('pl','Plumbing rough-in','Brunswick Plumbing',6,['rf']);add('el','Electrical rough-in','Tideline Electric',6,['rf']);add('hv','HVAC rough-in','Island Air Mechanical',5,['rf']);
  add('ri','Rough inspections','County inspector',2,['wd','pl','el','hv']);add('in','Insulation','Comfort Insulation',3,['ri']);add('dw','Drywall','Precision Drywall',12,['in']);add('tl','Tile install','Stoneline Tile',6,['dw']);return t;}
function vSchedule(){
  const d=S.delay,span=63,base=Date.UTC(2026,8,28),M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt=n=>{const x=new Date(base+n*864e5);return M[x.getUTCMonth()]+' '+x.getUTCDate();};const pct=n=>(n/span*100).toFixed(2);
  const now=plan(d),was=plan(0),order=['fr','rf','wd','pl','el','hv','ri','in','dw','tl'],due=now.tl.start-21;
  const notices=order.filter(id=>id!=='fr'&&id!=='ri'&&now[id].start!==was[id].start);
  let ticks='';for(let i=0;i<9;i++)ticks+=`<span class="g-tick" style="left:${pct(i*7)}%">${fmt(i*7)}</span>`;
  const today=`<span class="g-today" style="left:${pct(7)}%"></span>`;
  return `<div class="wrap stack">
  <div class="page-head"><div><p class="crumb">Jobs / Shoreline Drive</p><h1>Shoreline Drive · Schedule</h1></div></div>
  <section class="card page-head" style="align-items:center" aria-label="Framing delay"><div><h2>Framing delay</h2><p class="sub" style="margin-top:2px">Framing now finishes ${fmt(now.fr.end-1)} (baseline ${fmt(was.fr.end-1)}). Change the delay and every later trade moves with it.</p></div>
    <div class="stepper"><button data-act="delay" data-d="-1" aria-label="One day less">−</button><span class="num" style="min-width:90px;text-align:center;font-size:18px" aria-live="polite">${d===0?'none':'+'+d+(d===1?' day':' days')}</span><button data-act="delay" data-d="1" aria-label="One day more">+</button></div></section>
  <section class="card" aria-labelledby="gt-h"><div class="page-head" style="align-items:center;margin-bottom:8px"><h2 id="gt-h">Gantt</h2>
    <div class="legend"><span><i style="background:var(--accent)"></i>On baseline</span><span><i style="background:var(--warn)"></i>Moved</span><span><i style="border:1px dashed var(--muted)"></i>Baseline</span></div></div>
    <div class="scroll-x"><div class="gantt">
      <div class="g-row g-head"><div class="g-label muted" style="font-size:13px">Task · trade</div><div class="g-track">${ticks}</div></div>
      ${order.map(id=>{const a=now[id],b=was[id],mv=a.start!==b.start;return `<div class="g-row"><div class="g-label"><strong>${a.name}</strong><span>${a.trade} · ${fmt(a.start)} to ${fmt(a.end-1)}</span></div><div class="g-track">${today}<span class="g-base" style="left:${pct(b.start)}%;width:${pct(b.dur)}%"></span><span class="g-bar${mv?' moved':''}" style="left:${pct(a.start)}%;width:${pct(a.dur)}%"></span></div></div>`;}).join('')}
      <div class="g-row"><div class="g-label"><strong>Kitchen tile selection due</strong><span>Homeowner · ${fmt(due)}</span></div><div class="g-track">${today}<span class="g-ms" style="left:${pct(due)}%"></span></div></div>
    </div></div><p class="muted" style="font-size:12px;margin:8px 0 0">Dark vertical line: today, Oct 5.</p></section>
  <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <section class="card" aria-labelledby="tn-h"><h2 id="tn-h">Trade notices</h2><p class="sub" style="margin:2px 0 10px">Texted at 5:00 PM unless you hold them. Trades confirm by replying Y.</p>
      ${notices.length?notices.map(id=>`<div class="kv"><span>${now[id].trade}</span><span>${now[id].name} now starts ${fmt(now[id].start)} (was ${fmt(was[id].start)})</span></div>`).join(''):'<p style="margin:0">No dates have moved, so nothing will be sent.</p>'}</section>
    <section class="foreman"><p class="kicker">Foreman</p><p style="margin:6px 0 8px">Tile install moves to ${fmt(now.tl.start)}. With a 3-week lead time, the homeowners’ kitchen tile selection is now due ${fmt(due)}; their app updates when you publish.</p><p style="margin:0">Rough inspections land on ${fmt(now.ri.start)}. Request the county slot by ${fmt(now.ri.start-7)}.</p></section>
  </div></div>`;}

/* inbox */
const THREADS=[
  {id:'island',job:'Shoreline Drive',subject:'Moving the kitchen island',from:'Dana Whitfield',channel:'Portal',time:'9:12 AM',
   asked:'Move the island about 6 inches toward the window for fridge clearance.',decided:'Nothing yet.',open:'The prep-sink drain is already roughed in; price and plumbing impact unknown.',next:'Sam (PM) sends a price before Friday, Oct 9.',
   actions:[['island-co','Create change request','Change request CR-7 created and linked'],['island-pl','Ask Brunswick Plumbing for a price','Texted Brunswick Plumbing']],
   msgs:[['Dana Whitfield','Sat 4:40 PM · portal','We walked the framing Saturday. Could the island move about 6 inches toward the window? It feels tight by the fridge.',0],['Sam (PM)','Sat 6:05 PM · text','Possible. The prep-sink drain is roughed in there, so I need to check with our plumber first.',1],['Dana Whitfield','Mon 9:12 AM · portal','Thanks. If it costs extra, can you send the number before Friday? Our designer meets us then.',0]],
   draft:'Hi Dana, I have asked Brunswick Plumbing to price moving the prep-sink drain. I will send you a change request with the cost and any schedule impact by Thursday, so you have it before you meet your designer.'},
  {id:'tile',job:'Marsh Hen Lane',subject:'Herringbone tile question',from:'Ken Alvarez',channel:'Text message',time:'8:47 AM',
   asked:'Does a herringbone layout cost extra? They like sample B.',decided:'Prefers sample B, not yet confirmed in Selections.',open:'Herringbone labor upcharge; the selection is due Friday, Oct 9.',next:'PM answers and points them to the selection to confirm.',
   actions:[['tile-sel','Pre-fill sample B in Selections','Sample B pre-filled for their approval']],
   msgs:[['Ken Alvarez','Mon 8:47 AM · text','Is the herringbone layout extra? We really like sample B.',0]],
   draft:'Hi Ken, herringbone adds labor on that tile. I have pre-filled sample B in your Selections with the herringbone price so you can see it against your allowance and approve it there by Friday.'},
  {id:'studs',job:'Shoreline Drive',subject:'Lumber delivery short',from:'Seaside Framing',channel:'Email',time:'Yesterday',
   asked:'40 more 2x6 studs on site by Wednesday, Oct 7.',decided:'Crew keeps working on the second floor meanwhile.',open:'Reorder from the yard; the shortage is the supplier’s, so request a credit.',next:'Office reorders today.',
   actions:[['studs-po','Create PO for 40 studs','PO-1057 sent to Coastal Lumber'],['studs-cr','Log supplier shortage','Shortage logged against PO-1042']],
   msgs:[['Seaside Framing','Sun 7:20 PM · email','Friday’s delivery was short 40 2x6 studs. We can keep going but will need them by Wednesday.',0]],
   draft:'Thanks for flagging. A reorder for 40 2x6 studs goes in today for delivery Tuesday, and we will chase the yard for the shortage.'}
];
function vInbox(){const s=THREADS.find(t=>t.id===S.thread),D=S.inboxDone,rk=s.id+'-reply';
  return `<div class="wrap stack">
  <div class="page-head"><div><h1>Client inbox</h1><p class="sub">Portal messages, texts and email for every job in one place, each with a summary at the top.</p></div></div>
  <div class="split">
    <div class="threads" aria-label="Threads">${THREADS.map(t=>`<button class="thread" aria-pressed="${t.id===S.thread}" data-act="thread" data-id="${t.id}"><span class="meta"><span>${t.job}</span><span>${t.time}</span></span><strong>${t.subject}</strong><span class="muted" style="font-size:13px">${t.from} · ${t.channel}</span></button>`).join('')}</div>
    <section class="card thread-body stack" style="gap:14px" aria-labelledby="th-h">
      <div><p class="crumb">${s.job} · ${s.channel}</p><h2 id="th-h" style="font-size:20px">${s.subject}</h2></div>
      <div class="foreman"><p class="kicker">Foreman summary</p><dl class="sum"><dt>Asked</dt><dd>${s.asked}</dd><dt>Decided</dt><dd>${s.decided}</dd><dt>Still open</dt><dd>${s.open}</dd><dt>Next step</dt><dd><strong style="font-weight:500">${s.next}</strong></dd></dl></div>
      <div class="chips">${s.actions.map(a=>D[a[0]]?`<span class="done">${a[2]}</span>`:`<button class="btn btn-ghost" data-act="inboxAct" data-k="${a[0]}">${a[1]}</button>`).join('')}</div>
      <div class="msgs">${s.msgs.map(m=>`<div class="msg${m[3]?' me':''}"><div class="who"><b>${m[0]}</b> · ${m[1]}</div>${m[2]}</div>`).join('')}</div>
      <div class="card" style="background:var(--sunk)"><p class="muted" style="margin:0 0 6px;font-size:13px">Reply drafted by Foreman. Edit before sending.</p><p style="margin:0">${s.draft}</p>
        <div style="display:flex;justify-content:flex-end;margin-top:12px">${D[rk]?'<span class="done">Sent and logged to the job</span>':`<button class="btn" data-act="inboxAct" data-k="${rk}">Send reply</button>`}</div></div>
    </section></div></div>`;}

/* homeowner */
const OPTS=[
  {id:'a',name:'Pull-down, polished chrome',detail:'Single handle, 1-hole mount',price:420,sw:'#C9CDD2',ink:'#1A1D1C',note:'This is the faucet included in your contract. Choosing it gives you a $230 credit toward other fixtures.'},
  {id:'b',name:'Pro-style spring spout, matte black',detail:'Single handle, 1-hole, 1-week lead time',price:890,sw:'#2B2E30',ink:'#FFFFFF',note:'Fits your current 1-hole sink. Matte black matches the cabinet pulls you picked in August.'},
  {id:'c',name:'Bridge faucet, brushed brass',detail:'Two handles, 3-hole, 4-week lead time',price:1640,sw:'#B89A5E',ink:'#1A1D1C',note:'Needs a 3-hole sink; your current sink is 1-hole, so the sink selection would change too. Arrives in time if you confirm by Nov 2.'}
];
function vHomeowner(){const H=S.ho,allow=650;
  const p=OPTS.find(o=>o.id===H.picked),diff=p.price-allow;
  const home=`<div class="pcard hot"><p class="kicker">Needs your decision</p><h3 style="margin-top:4px">Change order #3: 8-ft sliding door</h3><p class="muted">Replaces the 6-ft door to the back deck, as you asked on Sept 30.</p>
      <div style="display:flex;gap:20px;margin:10px 0"><div><div class="muted" style="font-size:12px">Cost</div><div class="num" style="font-size:17px">+$4,250</div></div><div><div class="muted" style="font-size:12px">Schedule</div><div style="font-weight:500">No change</div></div></div>
      ${H.signed?'<p class="foreman" style="padding:10px 12px;margin:0">Signed Oct 5 at 2:14 PM. Your builder has been notified and the budget is updated.</p>':'<button class="btn full" data-act="hoSign">Approve and sign</button>'}</div>
    <div class="pcard"><h3>See your home in 3D</h3><p class="muted">Walk through every room with the finishes you have picked so far.</p><a class="btn btn-ghost full" style="margin-top:10px" href="#walkthrough">Open the walkthrough</a></div>
    <div class="pcard"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3>This week</h3><span class="muted" style="font-size:12px">From Sam · Oct 3</span></div>
      <p>Wall framing is done and the roof trusses arrive Thursday. Roofing should start Oct 16 if the weather holds. One item for you: the exterior siding color, due Friday.</p>
      <div class="two" style="margin-top:10px"><div class="photo">Photo: great room framing</div><div class="photo">Photo: porch columns</div></div></div>
    <div class="pcard"><h3>Selections coming up</h3>
      <button class="kv full" style="border:0;border-bottom:1px solid var(--line-soft);background:none;font:inherit;color:inherit;cursor:pointer;min-height:48px;align-items:center" data-act="hoTab" data-tab="sel"><span><span style="display:block;color:var(--fg);font-weight:500;text-align:left">Kitchen faucet</span><span style="display:block;font-size:13px;text-align:left">Plumbing fixtures · due Nov 2</span></span><span style="color:var(--accent);font-weight:500">Choose</span></button>
      <div class="kv" style="align-items:center;min-height:48px"><span><span style="display:block;color:var(--fg);font-weight:500">Exterior siding color</span><span class="warn" style="display:block;font-size:13px">Due Friday, Oct 9</span></span><span>3 options</span></div></div>
    <div class="pcard"><h3>Payments</h3><p>Draw 5 ($118,000) has been requested from your lender. Nothing is due from you right now.</p></div>`;
  const sel=`<div><button class="btn btn-ghost btn-sm" data-act="hoTab" data-tab="home">‹ Back</button><h3 style="font-size:20px;margin-top:8px">Kitchen faucet</h3><p class="muted" style="margin:2px 0 0;font-size:13px">Plumbing fixtures · due Nov 2, before plumbing trim</p></div>
    <div class="pcard" style="display:flex;justify-content:space-between"><div><div class="muted" style="font-size:12px">Your allowance</div><div class="num" style="font-size:18px">$650</div></div><div style="text-align:right"><div class="muted" style="font-size:12px">With this choice</div><div class="num ${diff>0?'warn':''}" style="font-size:18px">${diff===0?'At allowance':(diff>0?'+':'−')+money(Math.abs(diff))}</div></div></div>
    <div role="radiogroup" aria-label="Faucet options" style="display:flex;flex-direction:column;gap:10px">${OPTS.map(o=>{const dd=o.price-allow;return `<button class="opt" role="radio" aria-checked="${o.id===H.picked}" aria-pressed="${o.id===H.picked}" data-act="hoPick" data-id="${o.id}"><span class="swatch" style="background:${o.sw};color:${o.ink}">Photo</span><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><strong>${o.name}</strong><span class="muted" style="font-size:13px">${o.detail}</span><span style="display:flex;justify-content:space-between;margin-top:4px;font-size:14px"><span class="num">${money(o.price)}</span><span class="${dd>0?'warn':''}" style="font-weight:500;${dd>0?'':'color:var(--accent)'}">${money(Math.abs(dd))} ${dd>0?'over':'under'}</span></span></span></button>`;}).join('')}</div>
    <div class="foreman" style="padding:12px 14px"><p class="kicker">Good to know</p><p style="margin:4px 0 0;font-size:14px">${p.note}</p></div>
    ${H.confirmed?`<p class="foreman" style="padding:12px 14px;margin:0">${diff>0?'Confirmed. A change order for +'+money(diff)+' is drafted; your builder will send it for your signature.':'Confirmed. A '+money(-diff)+' credit is applied to your plumbing fixtures allowance.'}</p>`:`<button class="btn full" data-act="hoConfirm">Confirm ${p.name.split(',')[0].toLowerCase()}</button>`}`;
  return `<div class="wrap stack"><div class="page-head"><div><h1>Homeowner app</h1><p class="sub">What a Trifecta client sees on their phone. Tap through it as they would.</p></div></div>
  <div class="phone-split">
    <div class="phone" role="region" aria-label="Homeowner app preview">
      <div class="phone-head"><small>Trifecta Builders</small><h2>Shoreline Drive</h2><div style="display:flex;justify-content:space-between;font-size:13px;color:var(--on-navy-muted);margin-bottom:6px"><span>Framing</span><span>38% complete</span></div><div class="progress"><i style="width:38%"></i></div></div>
      <div class="phone-body">${H.tab==='sel'?sel:home}</div>
      <div class="phone-tabs"><button data-act="hoTab" data-tab="home" aria-current="${H.tab==='home'}">Home</button><button data-act="hoTab" data-tab="sel" aria-current="${H.tab==='sel'}">Selections</button><a href="#walkthrough">3D home</a></div>
    </div>
    <aside class="card try"><h2>What to try</h2><ol><li>Sign change order #3. In the real product the budget and the change order log update at the same moment.</li><li>Open Selections and pick a faucet. The allowance difference updates as you choose, and confirming drafts the change order.</li><li>Open the 3D home. Homeowners walk the same model your team sees.</li></ol>
      <p class="muted" style="font-size:14px;margin:12px 0 0">The app carries the builder’s name and colors, not Plumbline’s.</p></aside>
  </div></div>`;}

/* field */
function vField(){const F=S.field;
  const idle=`<button class="mic" data-act="fRec"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg><strong>Tap to dictate today’s log</strong><span style="font-size:14px">Talk for 30 seconds. Foreman fills in the log for you to check.</span></button>
    <div class="two"><button class="btn btn-ghost" style="min-height:54px">Add photos</button><button class="btn btn-ghost" style="min-height:54px">Clock in crew</button></div>`;
  const rec=`<div class="pcard"><div class="muted" style="font-size:12px">You said · 0:34</div><p style="color:var(--muted)">“Seaside had six guys today, finished the back walls, started laying out trusses. Lumber was short forty two-by-six studs, office is reordering. No injuries. Header over the great-room front windows isn’t on S-2, need the engineer to tell us.”</p></div>
    <div class="pcard" style="padding-block:4px"><div class="kv"><span>Work done</span><span>Back walls done; truss layout started</span></div><div class="kv"><span>Crew</span><span>Seaside Framing · 6</span></div><div class="kv"><span>Deliveries</span><span class="warn" style="font-weight:500">Short 40 2x6 studs · reorder linked</span></div><div class="kv"><span>Safety</span><span>No incidents</span></div><div class="kv"><span>Weather</span><span>68°F, clear, wind 9 mph</span></div></div>
    <div class="foreman" style="padding:12px 14px"><p style="margin:0;font-size:14px"><strong>Question for the engineer?</strong> The header size over the great-room front windows is missing from sheet S-2.</p>
      ${F.rfi?'<p class="done" style="margin:0">RFI #9 sent · answer due Oct 7</p>':'<button class="btn btn-ghost full" style="margin-top:10px" data-act="fRfi">Create RFI and send</button>'}</div>
    <label class="check pcard" for="f-share" style="margin:0"><input id="f-share" type="checkbox" data-input="fShare" ${F.share?'checked':''}> Share a summary with the homeowner</label>
    ${F.posted?`<p class="foreman" style="padding:12px;margin:0;text-align:center">Posted 3:42 PM · ${F.share?'summary queued for the homeowner update':'internal only'}</p>`:'<button class="btn full" style="min-height:52px" data-act="fPost">Post daily log</button>'}`;
  return `<div class="wrap stack"><div class="page-head"><div><h1>Field app</h1><p class="sub">Built for a superintendent with gloves on and one bar of signal.</p></div></div>
  <div class="phone-split">
    <div class="phone" role="region" aria-label="Field app preview">
      <div class="phone-head"><small>Shoreline Drive</small><h2>Daily log · Mon, Oct 5</h2><span class="chip" style="background:rgba(255,255,255,.15);color:var(--on-navy)">Weather filled in automatically</span></div>
      <div class="phone-body">${F.rec?rec:idle}</div>
    </div>
    <aside class="card try"><h2>What to try</h2><ol><li>Tap the microphone. This demo plays a recorded example; the real app transcribes the super’s own voice.</li><li>Send the RFI. It goes to the engineer with the sheet reference and shows up on the job’s RFI log.</li><li>Post the log. Only the summary reaches the homeowner, never internal notes.</li></ol>
      ${F.rec?'<button class="btn btn-ghost" data-act="fReset" style="margin-top:12px">Start this demo over</button>':''}</aside>
  </div></div>`;}

const VIEWS={tour:vTour,plans:vPlans,dashboard:vDashboard,budget:vBudget,schedule:vSchedule,inbox:vInbox,homeowner:vHomeowner,field:vField};
const ALIAS={walkthrough:['plans','3d'],takeoff:['plans','takeoff']};
let route='tour';

function render(scrollTop){
  if(VW.api&&!(route==='plans'&&S.plans.tab==='3d'))VW.api.stop();
  const view=$('#view');
  view.innerHTML=VIEWS[route]();
  document.querySelectorAll('#rail a').forEach(a=>{const r=a.getAttribute('href').slice(1);if(r===route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(route==='plans'&&S.plans.tab==='3d')mount3D();
  if(route==='plans'&&S.plans.tab==='takeoff')fillTakeoff();
  if(scrollTop)window.scrollTo(0,0);
}
function go(){
  let h=(location.hash||'').slice(1);
  if(ALIAS[h]){S.plans.tab=ALIAS[h][1];h=ALIAS[h][0];}
  route=VIEWS[h]?h:'tour';
  render(true);
}
let toastT;function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},3400);}

/* ---------- actions ---------- */
const ACT={
  dig:e=>{S.dig[e.dataset.id]=true;render();},
  filter:()=>{S.overOnly=!S.overOnly;render();},
  sendPos:()=>{S.poSent=true;render();toast('12 POs sent. Trades accept or decline by text.');},
  matchBills:()=>{S.billDone=true;render();toast('Bills matched to PO-1042 and pushed to QuickBooks.');},
  delay:e=>{S.delay=clamp(S.delay+(+e.dataset.d),0,10);render();},
  thread:e=>{S.thread=e.dataset.id;render();},
  inboxAct:e=>{S.inboxDone[e.dataset.k]=true;render();},
  hoTab:e=>{S.ho.tab=e.dataset.tab;render();},
  hoSign:()=>{S.ho.signed=true;render();},
  hoPick:e=>{S.ho.picked=e.dataset.id;S.ho.confirmed=false;render();},
  hoConfirm:()=>{S.ho.confirmed=true;render();},
  fRec:()=>{S.field.rec=true;render();},
  fRfi:()=>{S.field.rfi=true;render();},
  fPost:()=>{S.field.posted=true;render();},
  fReset:()=>{S.field={rec:false,rfi:false,share:true,posted:false};render();},
  plansTab:e=>{S.plans.tab=e.dataset.tab;render();},
  confirmPlan:()=>{S.plans.confirmed=true;render();toast('Plan confirmed. Quantities are now marked ready for the estimate.');},
  mode:e=>{S.plans.mode=e.dataset.m;VW.api&&VW.api.setMode(S.plans.mode);render();},
  zoom:e=>{VW.api&&VW.api.zoom(+e.dataset.z);},
  room:e=>{if(!VW.api)return;const wasWalk=S.plans.mode==='walk';VW.api.goTo(e.dataset.room);if(!wasWalk){S.plans.mode='walk';VW.api.setMode('walk');render();}},
  photo:()=>{VW.api&&VW.api.photo();},
  photoCancel:()=>{VW.api&&VW.api.cancelPhoto();},
  photoSave:()=>{VW.api&&VW.api.savePhoto();},
  tkReset:()=>{S.plans.qty={};S.plans.price={};fillTakeoff();toast('Edits cleared. Quantities are back to the calculated values.');},
  tkSend:()=>{const n=calcTakeoff(S.plans.a,S.plans.qty,S.plans.price).length;toast(`${n} lines added to the Shoreline Drive estimate under their cost codes.`);}
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;const f=ACT[el.dataset.act];if(f){e.preventDefault();f(el,e);}});
function onInput(e){
  const el=e.target,k=el.dataset&&el.dataset.input;if(!k)return;
  if(k==='assume'){const key=el.dataset.k;S.plans.a[key]=el.type==='checkbox'?el.checked:el.value;fillTakeoff();if(key==='height'&&VW.api)VW.api.setHeight(S.plans.a.height);}
  else if(k==='qty'||k==='price'){const v=parseFloat(el.value);const store=k==='qty'?S.plans.qty:S.plans.price;if(isNaN(v))delete store[el.dataset.key];else store[el.dataset.key]=v;if(e.type==='change')fillTakeoff();}
  else if(k==='furnished'&&e.type==='change'){S.plans.furnished=el.checked;VW.api&&VW.api.setFurnished(el.checked);}
  else if(k==='finish'&&e.type==='change'){S.plans.style=el.value;VW.api&&VW.api.setStyle(el.value);}
  else if(k==='lighting'&&e.type==='change'){S.plans.lighting=el.value;VW.api&&VW.api.setLighting(el.value);}
  else if(k==='fShare'&&e.type==='change'){S.field.share=el.checked;}
  else if(k==='upload'&&e.type==='change'){const f=el.files&&el.files[0];if(f){S.plans.upload=f.name;render();}}
}
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.input;if(k==='assume'&&e.target.type==='number')onInput(e);});
document.addEventListener('change',onInput);

/* ---------- 3D viewer glue ---------- */
const VW={api:null,loading:null};
const MOBILE=matchMedia('(pointer: coarse)').matches||innerWidth<700;
let lastPhotoPaint=0;
function photoUI(p){
  const bar=$('#photo-bar');if(!bar)return;
  if(p.state==='rendering'){const now=performance.now();if(now-lastPhotoPaint<250)return;lastPhotoPaint=now;}
  bar.innerHTML=photoBar(p);
  bar.classList.toggle('active',p.state!=='off');
}
function syncViewer(){const P=S.plans,a=VW.api;a.setStyle(P.style);a.setFurnished(P.furnished);a.setHeight(P.a.height);a.setMode(P.mode);a.setLighting(P.lighting);}
async function mount3D(){
  const stage=$('#three-stage');if(!stage)return;
  const hide=()=>{const l=$('#three-load');if(l)l.hidden=true;};
  if(VW.api){VW.api.attach(stage);syncViewer();hide();return;}
  if(!VW.loading){
    VW.loading=import('./viewer/viewer.js').then(m=>m.createViewer(stage,{mobile:MOBILE,onPhoto:photoUI}));
  }
  try{
    const api=await VW.loading;VW.api=api;
  }catch(err){
    console.error(err);VW.loading=null;
    stage.innerHTML='<div class="three-fallback">The 3D view could not start in this browser. It needs WebGL 2, which most current browsers support. The floor plan and takeoff tabs still work.</div>';
    return;
  }
  const cur=$('#three-stage');
  if(route==='plans'&&S.plans.tab==='3d'&&cur){VW.api.attach(cur);syncViewer();hide();}
  else VW.api.stop();
}
document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-move]');if(b&&VW.api){VW.api.hold(b.dataset.move);e.preventDefault();}});
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,()=>{if(VW.api)VW.api.hold(null);}));
document.addEventListener('visibilitychange',()=>{if(!VW.api)return;if(document.hidden)VW.api.stop();else if(route==='plans'&&S.plans.tab==='3d')VW.api.start();});

window.addEventListener('hashchange',go);
go();
