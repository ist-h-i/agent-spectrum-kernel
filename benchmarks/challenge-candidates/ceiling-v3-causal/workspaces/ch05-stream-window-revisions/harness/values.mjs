const clone=structuredClone,isArray=Array.isArray,safeInteger=Number.isSafeInteger,own=Object.hasOwn,freeze=Object.freeze;
export const prepare=()=>null;
export function capture(receiver,method){
 if(!receiver||(method!=='exportCheckpoint'&&method!=='stats'))throw new Error('Unsupported public value operation');
 const value=method==='exportCheckpoint'?receiver.exportCheckpoint():receiver.stats();
 if(value===null||typeof value!=='object')throw new Error('JSON value required');
 return freeze({
  set(path,next){if(!isArray(path)||path.length<1||path.length>16)throw new Error('Invalid JSON path');for(let i=0;i<path.length;i++){const key=path[i];if((typeof key!=='string'&&!safeInteger(key))||key==='__proto__'||key==='prototype'||key==='constructor')throw new Error('Invalid JSON path');}let target=value;for(let i=0;i<path.length-1;i++){const key=path[i];if(!target||typeof target!=='object'||!own(target,key))throw new Error('Unknown JSON path');target=target[key];}if(!target||typeof target!=='object')throw new Error('Invalid JSON parent');target[path[path.length-1]]=clone(next);return null;},
  read(){return clone(value);}
 });
}
