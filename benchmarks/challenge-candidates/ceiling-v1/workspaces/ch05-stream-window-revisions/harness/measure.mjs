import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createProcessor } from '../src/processor.mjs';
import { createSink } from './sink.mjs';
import { steadyLoad, activeGrowthLoad } from './generator.mjs';
import { consume } from './consumer.mjs';

const recipe = JSON.parse(readFileSync(new URL('../data/load.json', import.meta.url)));
if (!global.gc) throw new Error('Run with node --expose-gc harness/measure.mjs');
for (const [mode, generator] of [['steady', steadyLoad], ['active_growth', activeGrowthLoad]]) {
  for (let repetition = 0; repetition < recipe.repetitions; repetition++) {
    const sink = createSink({ collect: false });
    const processor = createProcessor({ ...recipe, sink });
    global.gc();
    const baseline = process.memoryUsage();
    const samples = [];
    let count = 0;
    const start = performance.now();
    for (const input of generator(recipe)) {
      consume(processor, input);
      count++;
      if (input.kind === 'watermark' || count % 4096 === 0) {
        global.gc();
        const memory = process.memoryUsage();
        samples.push({ count, heapUsed: memory.heapUsed, rss: memory.rss });
      }
    }
    global.gc();
    const final = process.memoryUsage();
    console.log(JSON.stringify({ recipeVersion: recipe.recipeVersion, mode, repetition, count,
      node: process.version, platform: process.platform, arch: process.arch,
      elapsedMs: performance.now() - start, baseline, final,
      peakSampledHeapUsed: Math.max(baseline.heapUsed, final.heapUsed, ...samples.map(item => item.heapUsed)),
      peakSampledRss: Math.max(baseline.rss, final.rss, ...samples.map(item => item.rss)),
      samples, sink: sink.snapshot(), diagnosticStats: processor.stats(), calibrated: false }));
  }
}
