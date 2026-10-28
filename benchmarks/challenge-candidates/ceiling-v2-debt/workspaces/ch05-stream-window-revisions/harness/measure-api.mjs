import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createSink } from './sink.mjs';
import { steadyLoad, activeGrowthLoad } from './generator.mjs';
import { consume } from './consumer.mjs';
// Capture measurement primitives before importing submitted implementation code.
const memoryUsage = process.memoryUsage.bind(process);
const now = performance.now.bind(performance);
const append = Function.call.bind(Array.prototype.push);
const maximum = Math.max;
const nullPrototype = Object.setPrototypeOf;
const nextInput = Function.call.bind(Object.getPrototypeOf(Object.getPrototypeOf(steadyLoad(recipePlaceholder()))).next);
function recipePlaceholder(){return {steadyRounds:0}}
const dataArray = () => nullPrototype([], null);
const collect = global.gc?.bind(global);
const recipe = JSON.parse(readFileSync(new URL('../data/load.json', import.meta.url)));
export async function runProfile({mode,repetition}) {
  if(!collect)throw new Error('Run with node --expose-gc');
  if(!['steady','active_growth'].includes(mode)||![0,1,2].includes(repetition))throw new Error('Invalid fixed profile');
  const {createProcessor}=await import('../src/processor.mjs');
  const generator=mode==='steady'?steadyLoad:activeGrowthLoad;
  const sink=createSink({collect:false}),processor=createProcessor({...recipe,sink});
  collect();const baseline=memoryUsage(),samples=dataArray();let count=0;const start=now(),inputs=generator(recipe);
  for(;;){const next=nextInput(inputs);if(next.done)break;const input=next.value;consume(processor,input);count++;
    if(input.kind==='watermark'||count%4096===0){collect();const memory=memoryUsage();append(samples,{count,heapUsed:memory.heapUsed,rss:memory.rss});}}
  collect();const final=memoryUsage();let peakHeap=maximum(baseline.heapUsed,final.heapUsed),peakRss=maximum(baseline.rss,final.rss);
  for(let index=0;index<samples.length;index++){peakHeap=maximum(peakHeap,samples[index].heapUsed);peakRss=maximum(peakRss,samples[index].rss);}
  return {recipeVersion:recipe.recipeVersion,mode,repetition,count,node:process.version,platform:process.platform,arch:process.arch,elapsedMs:now()-start,baseline,final,peakSampledHeapUsed:peakHeap,peakSampledRss:peakRss,samples,sink:sink.snapshot(),diagnosticStats:processor.stats(),calibrated:false};
}
export async function runMeasurement(){const records=dataArray();for(const mode of ['steady','active_growth'])for(let repetition=0;repetition<3;repetition++)append(records,await runProfile({mode,repetition}));return records;}
