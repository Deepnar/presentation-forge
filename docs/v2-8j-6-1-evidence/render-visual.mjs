import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile,mkdir,mkdtemp,rm,readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { preview } from '../../src/preview.js';
import { createProjectCitationExporter } from '../../src/projects/citation-export.js';
import { pureFixture,binding,request } from '../../test/v2-citation-export-fixture.js';
const run=promisify(execFile),base='docs/v2-8j-6-1-evidence/native';
const result={renderer:'Installed LibreOffice Impress via isolated profiles, Poppler at80dpi',slides:[],notes:null};
for(const name of ['qualified','control']) {
  const out=await preview(path.join(base,name+'.pptx'),{outDir:path.join(base,name),dpi:80});
  result.slides.push({name,pages:out.pages.map(p=>path.relative(process.cwd(),p)),pdf:path.relative(process.cwd(),out.pdf)});
}
result.pixelComparison=[];
for(let i=1;i<=3;i++) {
  const a=await sharp(path.join(base,'qualified',`slide-${i}.png`)).raw().toBuffer({resolveWithObject:true});
  const b=await sharp(path.join(base,'control',`slide-${i}.png`)).raw().toBuffer({resolveWithObject:true});
  if(JSON.stringify(a.info)!==JSON.stringify(b.info))throw Error('Canvas dimensions changed.');
  let changed=0,max=0;for(let j=0;j<a.data.length;j++){const delta=Math.abs(a.data[j]-b.data[j]);if(delta)changed++;max=Math.max(max,delta);}
  result.pixelComparison.push({slide:i,width:a.info.width,height:a.info.height,changedChannels:changed,maxChannelDelta:max});
  if(changed)throw Error('Citation export changed the visible slide.');
}
const fixture=await pureFixture();fixture.doc.scenes=fixture.doc.scenes.slice(0,1);
const exported=await createProjectCitationExporter(fixture.backend).render(binding,request());if(!exported.ok)throw Error(exported.code);
const short=path.join(base,'short-notes.pptx');await writeFile(short,exported.bytes);
const dir=path.join(base,'short-notes');await mkdir(dir,{recursive:true});const profile=await mkdtemp(path.join(os.tmpdir(),'forge-j6-notes-lo-'));
try {
  const filter='pdf:impress_pdf_Export:'+JSON.stringify({ExportNotesPages:{type:'boolean',value:'true'},ExportOnlyNotesPages:{type:'boolean',value:'true'}});
  const command=['-env:UserInstallation=file://'+profile,'--headless','--norestore','--invisible','--convert-to',filter,'--outdir',dir,short];
  const log=await run('soffice',command,{timeout:60000});await writeFile(path.join(dir,'conversion.log'),log.stdout+log.stderr);
  const pdf=path.join(dir,'short-notes.pdf');await run('pdftoppm',['-singlefile','-png','-r','80',pdf,path.join(dir,'notes')],{timeout:20000});
  const text=(await run('pdftotext',['-layout',pdf,'-'],{timeout:10000})).stdout;
  for(const value of ['claim support not assessed','Title: "Evidence 0"','URL: "https://example.org/0"','C1'])if(!text.replace(/\s+/g,' ').includes(value))throw Error('Notes-page PDF did not preserve '+value);
  await writeFile(path.join(dir,'notes.txt'),text);
  result.notes={command:['soffice',...command],pdf,image:path.join(dir,'notes.png'),actualNotesTextVerified:true};
} finally {await rm(profile,{recursive:true,force:true});}
await writeFile('docs/v2-8j-6-1-evidence/visual-measurements.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
