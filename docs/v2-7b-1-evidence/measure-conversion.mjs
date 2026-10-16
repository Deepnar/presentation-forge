import { writeFile } from 'node:fs/promises';
import { convertGeneratedDeck } from '../../src/projects/legacy-conversion.js';
import { IMPORT_DECK } from '../../test/v2-import-fixture.js';

const boundary = { title: 'Boundary deck', theme: 'warm-humanist', sections: ['Results', 'Results'], slides: Array.from({ length: 60 }, (_, index) => ({ type: 'bullets', headline: `Evidence ${index + 1}`, section: index < 30 ? 0 : 1, bullets: ['Measured first claim', 'Measured second claim', 'Measured third claim', 'Measured fourth claim'] })) };
const results = [];
for (const [name, deck] of [['ordinary', IMPORT_DECK], ['boundary', boundary]]) {
  const samples = [];
  for (let index = 0; index < 5; index++) {
    const start = performance.now(); const converted = await convertGeneratedDeck(deck);
    samples.push(performance.now() - start);
    if (converted.intent.slides.length !== deck.slides.length) throw new Error('slide loss');
  }
  results.push({ name, slides: deck.slides.length, semanticConversionMs: samples, medianMs: [...samples].sort((a, b) => a - b)[2] });
}
const start = performance.now(); let refused = false;
try { await convertGeneratedDeck({ ...boundary, slides: [...boundary.slides, boundary.slides[0]] }); }
catch (error) { if (error.code !== 'invalid-source') throw error; refused = true; }
if (!refused) throw new Error('over-limit source admitted');
await writeFile('out/v2-7b-1-validation/conversion-performance.json', `${JSON.stringify({ implementationSha: '662f7d6a08647d431eded1ea17c5d13e7ca1c591', method: 'Five sequential pure semantic conversions per fixture in one fresh process; first ordinary sample includes cold legacy/intent validator initialization. Excludes source IO, compilation and persistence. Observations, not another Node test suite.', results, oversized: { slides: 61, refused, elapsedMs: performance.now() - start } }, null, 2)}\n`);
console.log(JSON.stringify(results));
