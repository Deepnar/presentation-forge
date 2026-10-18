import { createDocument } from '../packages/model/engine.ts';
import { createToolSession } from '../packages/tools/session.ts';
export function seed() {
  return [{ id: 's1', width: 13.333, height: 7.5, background: { fill: 'FFFFFF' }, layoutState: 'customized', elements: [
    { id: 'text', kind: 'text', x: 1, y: 0.5, w: 10, h: 1.5, z: 0, provenance: 'compiler', semanticRef: 'text-block', customized: true, paragraphs: [{ align: 'left', runs: [{ text: 'Measured ', size: 24, family: 'Inter', color: '112233', bold: true }, { text: 'results', size: 20, family: 'Inter', color: '445566', italic: true }] }] },
    { id: 'chart', kind: 'chart', x: 1, y: 2.5, w: 5, h: 3.5, z: 1, provenance: 'compiler', semanticRef: 'chart-block', chart: { chartKind: 'bar', categories: ['A','B'], series: [{ name: 'Score', values: [1.25,12.5] }], labels: { family: 'Inter', size: 12, color: '778899' } } },
    { id: 'table', kind: 'table', x: 7, y: 2.5, w: 5, h: 1.5, z: 2, provenance: 'compiler', semanticRef: 'table-block', table: { header: true, rows: [['Cell','Score'],['A','1.25'],['B','12.5']], layout: { rowHeights: [.5,.5,.5], colWidths: [2.5,2.5], headerFill: 'EEEEEE', headerColor: '111111', headerSize: 14, headerBold: true, bodyColor: '222222', bodySize: 12, fontFamily: 'Inter', padding: .05, gridColor: '999999' } } },
  ] }, { id: 's2', width: 13.333, height: 7.5, background: { fill: 'FFFFFF' }, layoutState: 'managed', elements: [{ id: 'other', kind: 'text', x: 1, y: 1, w: 8, h: 2, z: 0, provenance: 'human', paragraphs: [{ runs: [{ text: 'Unrelated private slide', size: 24, family: 'Inter' }] }] }] }];
}
export const target = (elementId, slideId = 's1') => ({slideId,elementId});
export const textEdit = (text = 'Human-reviewed ', runIndex = 0) => ({kind:'text',...target('text'),paragraphIndex:0,runIndex,text});
export const edit = (edits = [textEdit()], baseRevision = 0) => ({tool:'edit_content',args:{baseRevision,edits}});
export async function rig(overrides = {}, scenes = seed()) {
  const document = await createDocument(scenes);
  const binding = { document,projectId:'p',ownerId:'owner',actorId:'owner',agentId:'agent1',mode:'edit',readableSlides:['s1'],editableTargets:['text','chart','table'].map(id=>target(id)),selection:[target('text')],...overrides };
  return {document,binding,tools:createToolSession(binding)};
}
