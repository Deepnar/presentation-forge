const base = (id, kind, x, y, w, h, z) => ({ id, kind, x, y, w, h, z, provenance: 'compiler' });
const text = (id, wording, z = 0) => ({
  ...base(id, 'text', 0.6, 0.35, 11.8, 0.55, z),
  paragraphs: [{ runs: [{ text: wording, size: 24, bold: true, color: '17324D' }] }],
});
const table = (id, x, y, z) => ({
  ...base(id, 'table', x, y, 4.8, 1.2, z),
  table: { rows: [['Material', 'Value'], ['Oxide', '12.5']], header: true },
});
const chart = (id, z) => ({
  ...base(id, 'chart', 6.2, 1.4, 5.7, 3.2, z),
  chart: { chartKind: 'bar', categories: ['Oxide', 'Sulfide'], series: [{ name: 'Conductivity', values: [12.5, 3.75] }] },
});
const slide = (id, elements) => ({ id, width: 13.333, height: 7.5, background: { fill: 'FFFFFF' }, layoutState: 'managed', elements });

export function nativeIdScenes() {
  const first = slide('mixed-1', [text('title-1', 'Native objects retain their identity'), chart('chart-1', 1), table('table-1', 0.6, 1.6, 2)]);
  const second = slide('mixed-2', [
    table('table-2a', 0.6, 1.6, 0), text('title-2', 'Tables before and after other objects', 1),
    table('table-2b', 0.6, 3.3, 2), chart('chart-2', 3),
    { ...base('picture', 'image', 11.7, 5.9, 0.5, 0.5, 4), image: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } },
    { ...base('placeholder', 'image', 9.9, 5.8, 1.4, 0.7, 5), image: { src: '' } },
    { ...base('hidden', 'text', 0, 0, 1, 1, 6), hidden: true, paragraphs: [{ runs: [{ text: 'Hidden wording', size: 12 }] }] },
  ]);
  const third = slide('mixed-3', [
    text('title-3', 'Decor, groups and native lines'),
    { ...base('group', 'group', 0.6, 1.6, 5, 3, 1), group: { children: [
      { ...table('nested-table', 0, 0, 0) },
      { ...base('nested-shape', 'shape', 0, 2, 1.4, 0.7, 1), shape: { form: 'roundRect', fill: '99C3DA' } },
    ] } },
    table('table-3', 6.2, 1.6, 2),
    { ...base('line', 'line', 0.6, 5.5, 11.6, 0.01, 3), line: { x2: 12.2, y2: 5.5, stroke: '17324D', strokeWidth: 1.5 } },
  ]);
  third.background.decor = [{ shape: 'rect', x: 0, y: 7.15, w: 13.333, h: 0.35, fill: '17324D' }];
  return [first, second, third];
}
