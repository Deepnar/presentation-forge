import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const base='docs/v2-8j-6-1-evidence/native',run=promisify(execFile),comparison=[];
for(let i=1;i<=3;i++) {
  const a=await sharp(`${base}/qualified/slide-${i}.png`).raw().toBuffer({resolveWithObject:true}),b=await sharp(`${base}/control/slide-${i}.png`).raw().toBuffer({resolveWithObject:true});
  if(JSON.stringify(a.info)!==JSON.stringify(b.info))throw Error('Canvas size changed.');
  let changed=0,max=0;for(let j=0;j<a.data.length;j++){const delta=Math.abs(a.data[j]-b.data[j]);if(delta)changed++;max=Math.max(max,delta);}
  if(changed)throw Error('Visible slide changed.');comparison.push({slide:i,width:a.info.width,height:a.info.height,changedChannels:changed,maxChannelDelta:max});
}
const pdf=`${base}/short-notes/short-notes.pdf`,text=(await run('pdftotext',['-layout',pdf,'-'])).stdout;
for(const value of ['claim support not assessed','Title: "Evidence 0"','URL: "https://example.org/0"','C1'])if(!text.replace(/\s+/g,' ').includes(value))throw Error('Missing notes content.');
await writeFile(`${base}/short-notes/notes.txt`,text);
const result={pixelComparison:comparison,notes:{pdf,image:`${base}/short-notes/notes.png`,actualNotesTextVerified:true},provenance:'Reused actual visual-01 render outputs; only whitespace-aware PDF extraction and pixel comparison repeated. Initial literal substring check failed on a valid line wrap. No new native render.'};
await writeFile('docs/v2-8j-6-1-evidence/visual-measurements.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
