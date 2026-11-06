import {createCore} from './core.mjs';
export function createEditor(options){
 const {sessionStore,sessionKey,clientId='local'}=options;
 if(sessionStore&&(!(typeof sessionKey==='string')||!sessionKey.length)){const e=new Error('invalid session key');e.code='INVALID_SESSION';throw e;}
 let core,active=true,initializing=true,revision=0;
 const previous=sessionStore?sessionStore.read(sessionKey):{revision:0,value:null};revision=previous.revision;
 const save=()=>{if(!active||initializing||!sessionStore)return;const next=sessionStore.compareAndSwap(sessionKey,revision,core.exportState());if(!next.accepted){const e=new Error('session ownership changed');e.code='SESSION_CONFLICT';throw e;}revision=next.revision;};
 core=createCore({...options,clientId:sessionStore?JSON.stringify([clientId,sessionKey]):clientId,onChange:save});
 if(previous.value!==null){if([1,2].includes(previous.value?.format))core.restoreDrafts(previous.value);else core.restoreState(previous.value);}
 initializing=false;save();
 const api={};for(const name of ['open','snapshot','edit','flush','receive','undo','switchTenant','saveDrafts','restoreDrafts'])api[name]=(...args)=>{if(!active){const e=new Error('editor disposed');e.code='CLOSED';throw e;}const result=core[name](...args);if(!['open','snapshot','saveDrafts'].includes(name))save();return result;};
 api.dispose=()=>{if(!active)return;active=false;core.detach();};return api;
}
