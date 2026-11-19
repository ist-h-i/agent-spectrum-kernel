'use strict';

const d = document;
const get = id => d.getElementById(id);
const { scenes, labels, pr } = JSON.parse(get('visual-data').textContent);
const svgNS = 'http://www.w3.org/2000/svg';
const state = { scene:0, caseIndex:0, position:0, timer:0, animation:0, narrow:false, selected:'', lastFocus:null };
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const current = () => scenes[state.scene];
const activeCase = () => current().cases[state.caseIndex];
const pathBySide = () => [activeCase().base, activeCase().target];
const end = () => Math.max(...pathBySide().map(path => path.length)) - 1;
const graph = get('visual-map');
const stage = get('visual-stage');
const keyFor = (a,b) => a+'>'+b;

function add(parent, tag, attrs={}, value) {
  const element = parent.namespaceURI === svgNS || tag === 'svg'
    ? d.createElementNS(svgNS, tag) : d.createElement(tag);
  for (const [key,v] of Object.entries(attrs)) element.setAttribute(key, v);
  if (value !== undefined) element.textContent = value;
  parent.append(element);
  return element;
}

const shapeMap = {
  request: ['M-22 -29H9l13 13v45h-44z M9 -29v13h13', 'M-11 -8l7 6-7 6m12 0h11'],
  artifact: ['M-22 -29H9l13 13v45h-44z M9 -29v13h13', 'M-11 -5h22m-22 8h22m-22 8h16'],
  shelf: ['M-32 -19h19l10 8h35v37h-64z', 'M-21 -3v21m12-21v21m12-21v21m12-21v21'],
  route: ['M0 -29a29 29 0 1 1 -.01 0z', 'M-13 0h10c7 0 7-13 19-13M-3 0c7 0 7 13 19 13'],
  gate: ['M0 -31L31 0 0 31-31 0z', 'M-10 0l7 7 14-14'],
  person: ['M0 -29a29 29 0 1 1 -.01 0z', 'M-3 -16a8 8 0 1 1-.01 0zM-16 13q1-20 21-12m2 4h16v11H7zm0 0 8 6 8-6'],
  result: ['M-22 -29H9l13 13v45h-44z M9 -29v13h13', 'M-11 -7h22m-22 8h22m-22 8h14'],
  list: ['M-26 -25h52v50h-52z', 'M-17 -13h5m6 0h23m-34 13h5m6 0h23m-34 13h5m6 0h23'],
  stop: ['M-12 -28h24l16 16v24L12 28h-24l-16-16v-24z', 'M-10 -10l20 20m-20 0 20-20'],
  service: ['M-30 -22h60v44h-60z', 'M-16 -11h32m-32 11h32m-32 11h32'],
};

function wrap(value, units, maxRows) {
  const lines = [];
  let line='', size=0;
  for (const char of value) {
    const add = char.codePointAt(0) <= 0x7f ? .57 : 1;
    if (size+add > units && line) {
      lines.push(line);
      if (lines.length === maxRows) {
        lines[maxRows-1] += '…';
        return lines;
      }
      line=''; size=0;
    }
    line += char; size += add;
  }
  if (line) lines.push(line);
  return lines;
}

function graphLayout(scene) {
  const { narrow } = state;
  const x = narrow ? 400 : Math.max(730, scene.stages * 155);
  const upper = scene.nodes.some(n=>n.track < 0) ? 155 : 0;
  const lower = scene.nodes.some(n=>n.track > 0) ? 155 : 0;
  const y = narrow ? 36 + scene.stages * 174 : 230 + upper + lower + (scene.nodes.some(n=>n.items.length)?56:0);
  const gap = (x-166)/Math.max(1,scene.stages-1);
  const positions=new Map(scene.nodes.map(n=>[n.id,narrow
    ? [200+n.track*126,60+n.stage*174]
    : [scene.stages === 1 ? x/2 : 83+n.stage*gap, 97+upper+n.track*155]]));
  return { x,y,positions };
}

function currentNode(node) {
  const override=activeCase().overrides.find(entry=>entry.id===node.id);
  return override ? {...node, ...Object.fromEntries(Object.entries(override).filter(([,v])=>v!==undefined))} : node;
}

function curve(a,b,side,parallel,skip) {
  const [x,y]=a,[u,v]=b;
  const off=!parallel ? 0 : side==='base' ? -7 : 7;
  if (state.narrow) {
    if (x===u) {
      if(skip){
        const dir=v>y?1:-1, bend=x < 200 ? 90 : -90;
        return `M${x-28} ${y+14*dir} C${x+bend} ${y+76*dir} ${u+bend} ${v-66*dir} ${u-24} ${v-23*dir}`;
      }
      const vdir=Math.sign(v-y), start=y+(vdir>0?111:-33), stop=v-(vdir>0?35:-110);
      if (vdir > 0 && stop <= start) return `M${x+off} ${y+34} V${v-35}`;
      return `M${x+off} ${start} V${stop}`;
    }
    const dir=Math.sign(u-x), dX=x+dir*34, eX=u-dir*15;
    if(y===v)return `M${dX} ${y+off} H${u-dir*34}`;
    return `M${dX} ${y+off} Q${eX} ${y+off} ${u+off} ${y+35*Math.sign(v-y)} V${v-35*Math.sign(v-y)}`;
  }
  const dir=Math.sign(u-x) || 1, start=x+dir*35, stop=u-dir*35;
  if (y===v) {
    if(skip){
      const bend=y-100 >= 18 ? -100 : 108;
      return `M${x+dir*27} ${y+Math.sign(bend)*18} C${start} ${y+bend} ${stop} ${v+bend} ${u-dir*27} ${v+Math.sign(bend)*18}`;
    }
    return `M${start} ${y+off} H${stop}`;
  }
  if (x===u) return `M${x+off} ${y+(v>y?94:-36)} V${v-(v>y?35:-94)}`;
  const mid=(start+stop)/2;
  return `M${start} ${y+off} C${mid} ${y+off} ${mid} ${v+off} ${stop} ${v+off}`;
}

function edgeSpecs(scene) {
  const all=new Map(), on=new Set();
  for(const name of ['base','target']) {
    for(const value of scene.cases) value[name].slice(1).forEach((id,i)=>{
      const key=keyFor(value[name][i],id);
      if(!all.has(key)) all.set(key,{a:value[name][i],b:id, sides:new Set()});
      all.get(key).sides.add(name);
      if(value===activeCase()) on.add(name+':'+key);
    });
  }
  return {all,on};
}

function drawTags(nodeGroup, node, active) {
  if (!node.items.length || node.state==='empty' || !active) return;
  const marks=['■','▲','●','◆','⬟','✦'];
  // Within each scene one identity always receives the same symbol. Excluded items stay muted.
  const identities=[...new Set(current().nodes.flatMap(n=>n.items.map(item=>item.id)))];
  const rightOccupied = current().nodes.some(n=>n.stage===node.stage && n.track>node.track);
  const column = state.narrow ? (node.track===1 || rightOccupied ? -46 : 46) : -45;
  const anchor=state.narrow && column < 0 ? 'end':'start';
  node.items.forEach((item,i)=>{
    const y = (state.narrow?-24:96)+i*14;
    const marker=item.excluded?'–':marks[identities.indexOf(item.id)%marks.length];
    wrap(marker+' '+item.label,state.narrow?12:17,1).forEach(line=>{
      add(nodeGroup,'text',{x:column,y,'text-anchor':anchor,class:'identity'+(item.excluded?' excluded':'')},line);
    });
  });
}

function drawSymbol(nodeGroup,node,active) {
  const [outline, emblem]=shapeMap[node.shape];
  add(nodeGroup,'path',{d:outline,class:'object-shape'});
  const mark=node.state==='empty' ? 'M-14 11l28-22' : node.state==='blocked' && node.shape==='gate' ? 'M-9-9l18 18m-18 0 18-18' : emblem;
  add(nodeGroup,'path',{d:mark,class:'object-emblem'});
  drawTags(nodeGroup,node,active);
}

function labelObject(nodeGroup,node) {
  let y=50;
  wrap(node.label,state.narrow?10.5:14,2).forEach(line=>{add(nodeGroup,'text',{y,class:'object-label'},line);y+=16;});
  wrap(node.caption,state.narrow?12:15,2).forEach(line=>{add(nodeGroup,'text',{y,class:'object-caption'},line);y+=13;});
}

function drawGraph() {
  cancelAnimationFrame(state.animation);
  const scene=current(), {x,y,positions}=graphLayout(scene);state.positions=positions;
  state.tracks=new Map();
  graph.replaceChildren();
  graph.setAttribute('viewBox',`0 0 ${x} ${y}`);
  add(graph,'title',{id:'visual-title'},scene.title+' — '+activeCase().label);
  const defs=add(graph,'defs');
  const dots=add(defs,'pattern',{id:'scene-grid',width:20,height:20,patternUnits:'userSpaceOnUse'});
  add(dots,'circle',{cx:2,cy:2,r:.7,fill:'#3e596c'});
  for(const [id,color] of [['current','#58e3cf'],['old','#9fb3c9'],['stopped','#ffb6a9'],['uncertain','#f8ce81'],['other','#59748b']]){
    const marker=add(defs,'marker',{id:'arrow-'+id,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:4,markerHeight:4,orient:'auto'});
    add(marker,'path',{d:'M0 0L10 5 0 10z',fill:color});
  }
  add(graph,'rect',{width:x,height:y,fill:'url(#scene-grid)'});
  const {all,on}=edgeSpecs(scene);
  const [base,target]=pathBySide();
  for(const [key, spec] of all) {
    const a=positions.get(spec.a),b=positions.get(spec.b);
    const aStage=scene.nodes.find(node=>node.id===spec.a).stage,bStage=scene.nodes.find(node=>node.id===spec.b).stage;
    for(const side of spec.sides) {
      const selected=on.has(side+':'+key);
      const to=currentNode(scene.nodes.find(node=>node.id===spec.b));
      const activeKind=to.refs.filter(ref=>ref.side===side).some(ref=>ref.status==='unknown') ? 'uncertain'
        : to.shape==='stop'||to.state==='blocked' ? 'stopped' : side==='base'?'old':'current';
      const line=add(graph,'path',{d:curve(a,b,side,spec.sides.size>1,Math.abs(aStage-bStage)>1),
        class:'edge '+(selected?activeKind:'other')+(side==='base'?' base-edge':''),
        'marker-end':'url(#arrow-'+(selected?activeKind:'other')+')',
        'data-side':side,'data-active':String(selected),'data-edge':key});
      state.tracks.set(side+':'+key,line);
    }
  }
  for(const original of scene.nodes) {
    const node=currentNode(original);
    const active=base.includes(node.id)||target.includes(node.id);
    const known=node.refs.every(ref=>ref.status!=='unknown');
    const allFromBase=node.refs.every(ref=>ref.side==='base');
    const onlyTarget=node.refs.every(ref=>ref.side==='target');
    const [pX,pY]=positions.get(node.id);
    const classes=['visual-node',node.state??'',node.shape==='stop'?'stop':'',active?'active':'idle',
      known?'':'unverified',allFromBase?'old-object':'',state.selected===node.id?'selected':''];
    const group=add(graph,'g',{transform:`translate(${pX} ${pY})`,class:classes.join(' '),role:'button',tabindex:0,
      'aria-label':node.label+(node.caption?' — '+node.caption:'')+(!known?' — '+labels.unknown:''),
      'aria-controls':'visual-detail', 'data-object':node.id});
    add(group,'rect',{x:-38,y:-38,width:76,height:76,rx:12,class:'focus-ring'});
    drawSymbol(group,node,active);
    labelObject(group,node);
    if(!known)add(group,'text',{x:26,y:-26,class:'badge-text',fill:'#f8ce81'},'?');
    else if(pr && (allFromBase || onlyTarget)){
      add(group,'text',{x:27,y:-25,class:'badge-text',fill:allFromBase?'#9fb3c9':'#58e3cf'},
        allFromBase?labels.baseShort:labels.targetShort);
    }
    if(pr && node.refs.some(ref=>ref.delta==='changed')) add(group,'circle',{cx:-22,cy:-26,r:4,class:'delta-mark'});
    group.addEventListener('click',()=>showDetail(node,group));
    group.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();showDetail(node,group);}
    });
  }
  state.tokens=[];
  for(const [side,path] of [['base',base],['target',target]])if(path.length){
    const token=add(graph,'g',{class:'token '+side,'aria-hidden':'true','data-token':side});
    add(token,'path',{d:'M-9-11H4l5 5v17H-9z'});
    add(token,'path',{d:'M-5-2H5m-10 5h8',class:'token-lines'});
    state.tokens.push({token,side,path});
  }
  paint(false);
}

function paint(animate) {
  cancelAnimationFrame(state.animation);
  const position=state.position;
  const start=performance.now();
  const mix=(a,b,t)=>a+(b-a)*t;
  function frame(now) {
    const t=animate&&!motion.matches ? Math.min(1,(now-start)/420) : 1;
    for (const {token,side,path} of state.tokens) {
      const from=path[Math.min(path.length-1,Math.max(0,position-1))],to=path[Math.min(path.length-1,position)];
      const [a,b]=state.positions.get(from), [c,e]=state.positions.get(to);
      const opposite=side==='base'?'target':'base';
      const shift=activeCase()[opposite][Math.min(position,activeCase()[opposite].length-1)]===to ? (side==='base'?-11:11):0;
      const edge=state.tracks.get(side+':'+keyFor(from,to));
      let x=mix(a,c,t)+shift,y=mix(b,e,t)-38;
      if (edge && t<1) {
        const len=edge.getTotalLength();
        if(t<.16){
          const p=edge.getPointAtLength(0);x=mix(a+shift,p.x,t/.16);y=mix(b-38,p.y,t/.16);
        }else if(t>.84){
          const p=edge.getPointAtLength(len);x=mix(p.x,c+shift,(t-.84)/.16);y=mix(p.y,e-38,(t-.84)/.16);
        }else{
          const p=edge.getPointAtLength(len*(t-.16)/.68);x=p.x;y=p.y;
        }
      }
      token.setAttribute('transform',`translate(${x} ${y})`);
      if(t===1)token.setAttribute('data-at',to);
    }
    if(t<1)state.animation=requestAnimationFrame(frame);
  }
  frame(start);
  const progress=get('visual-progress');
  progress.replaceChildren();
  for(let i=0;i<=end();i++)add(progress,'i',{class:'dot'+(i<=position?' on':'')+(i===position?' now':''),'aria-hidden':'true'});
  add(progress,'span',{},`${position} / ${end()}`);
}

function showDetail(node,source) {
  state.selected=node.id;state.lastFocus=source;
  graph.querySelectorAll('.visual-node').forEach(element=>element.classList.toggle('selected',element===source));
  get('detail-title').textContent=node.label;
  get('detail-default').hidden=true;
  get('detail-close').hidden=false;
  const body=get('visual-evidence');body.replaceChildren();
  for(const ref of node.refs) {
    const section=add(body,'section',{class:'evidence-entry'});
    if(pr)add(section,'h3',{},ref.side==='target'?labels.target:labels.base);
    section.append(get(ref.token).content.cloneNode(true));
  }
  // Bring the newly revealed details into the reading order, including on narrow screens.
  get('detail-title').focus({preventScroll:true});
  get('visual-detail').scrollIntoView({block:'nearest',behavior:'instant'});
}

function clearDetail(restore) {
  state.selected='';
  get('detail-title').textContent=labels.evidence;
  get('visual-evidence').replaceChildren();
  get('detail-default').hidden=false;get('detail-close').hidden=true;
  graph.querySelectorAll('.selected').forEach(node=>node.classList.remove('selected'));
  if(restore&&state.lastFocus?.isConnected)state.lastFocus.focus();
}

function stop() {
  clearInterval(state.timer);state.timer=0;
  get('visual-play').textContent=labels.play;
  get('visual-play').setAttribute('aria-pressed','false');
}

function advance() {
  if(state.position>=end()){stop();return;}
  state.position++;
  paint(true);
  const positions=['base','target'].flatMap(side=>{
    const path=activeCase()[side];
    if(!path.length)return [];
    const id=path[Math.min(state.position,path.length-1)];
    return [(pr?labels[side]+': ':'')+currentNode(current().nodes.find(n=>n.id===id)).label];
  });
  get('visual-live').textContent=labels.position+' '+state.position+'/'+end()+' · '+positions.join(' · ');
  if(state.position===end())stop();
}

function selectScene(index) {
  stop();state.scene=index;state.caseIndex=0;state.position=0;
  selectCase(0,true);
}

function selectCase(index,newScene=false) {
  stop();
  state.caseIndex=index;state.position=0;clearDetail(false);
  const filters=get('visual-cases');filters.replaceChildren();
  current().cases.forEach((item,i)=>{
    const button=add(filters,'button',{type:'button','aria-pressed':String(i===index),'data-case':i},item.label);
    button.addEventListener('click',()=>{selectCase(i);get('visual-cases').children[i].focus();});
  });
  if(newScene) {
    get('visual-subtitle').textContent=current().summary;
    const noSide=get('visual-absent');
    noSide.textContent=current().absent;noSide.hidden=!current().absent;
  }
  drawGraph();
  get('visual-live').textContent=activeCase().label;
  get('visual-play').disabled=end()<=0;
  get('visual-step').disabled=end()<=0;
}

get('detail-close').addEventListener('click',()=>clearDetail(true));
d.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.selected)clearDetail(true);});
get('visual-play').addEventListener('click',()=>{
  if(state.timer){stop();paint(false);return;}
  if(end()<=0)return;
  if(state.position===end()){state.position=0;paint(false);}
  get('visual-play').textContent=labels.pause;
  get('visual-play').setAttribute('aria-pressed','true');
  state.timer=setInterval(advance,950);
});
get('visual-step').addEventListener('click',()=>{stop();advance();});
get('visual-reset').addEventListener('click',()=>{stop();state.position=0;paint(false);});
const sceneSelect=get('visual-scene');
if(sceneSelect)sceneSelect.addEventListener('change',event=>selectScene(Number(event.target.value)));
state.narrow=stage.clientWidth<625;
selectScene(0);
new ResizeObserver(([entry])=>{
  const narrow=entry.contentRect.width<625;
  if(narrow!==state.narrow){
    state.narrow=narrow;drawGraph();
    if(state.selected)state.lastFocus=[...graph.querySelectorAll('.visual-node')].find(n=>n.dataset.object===state.selected);
  }
}).observe(stage);
