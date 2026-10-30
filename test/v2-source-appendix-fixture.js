import { pureFixture } from './v2-citation-export-fixture.js';
import { normalizeDesign } from '../packages/core/design.ts';
import { loadThemeDocument } from '../src/theme-loader.js';
export const design=()=>loadThemeDocument('warm-humanist').then(theme=>normalizeDesign({theme,mode:'light'}));
export function applyRequest(preview,extra={}){const {projectId,...counters}=preview.snapshot;return {...counters,designFingerprint:preview.designFingerprint,disclosure:'source-title-url-scene-v1',...extra};}
export async function appendixPure(options){
 const f=await pureFixture(options);f.doc.theme={name:'warm-humanist',variant:'light'};f.saved=[];
 f.backend.withCitationTransaction=(b,job)=>f.backend.withCitationReadTransaction(b,tx=>job({...tx,async saveScenes(scenes,provenance){f.saved.push({scenes:structuredClone(scenes),provenance});f.doc.scenes=structuredClone(scenes);return ++f.doc.revision;}}));return f;
}
