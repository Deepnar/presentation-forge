import type { SlideScene, SceneElement } from '../model/scene.generated.ts';
import type { DesignSystem } from '../model/design.generated.ts';
import { SCENE_W, SCENE_H } from '../model/scene-constants.ts';
import { measure, floorOf, type FitStyle } from '../core/fit.ts';
import { resolveRunStyle, type ResolvedRun } from './typography.ts';

export interface AppendixReference { title: string; url: string; slides: number[] }
export const APPENDIX_LIMITS = Object.freeze({ references: 512, pages: 120, nodes: 100000, bytes: 8*1024*1024 });
export const APPENDIX_FORMAT = 'source-appendix-v1';
export function appendixFailure(code: string): never { throw Object.assign(new Error('References appendix could not be composed.'), {code}); }
export const literalReferenceText = (value: string): string => value.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function scalar(value: string): boolean { return !/[\ufffe\uffff]/.test(value) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value); }

// Emit explicit native lines so unbroken URLs have identical segmentation in both consumers.
function lines(text: string, width: number, style: FitStyle): string[] {
  if(!text.length)return [''];
  const result: string[]=[];let part='',used=0;
  for(const {segment:glyph} of new Intl.Segmenter('und',{granularity:'grapheme'}).segment(text)){
    const advance=Math.max(measure(glyph,style)*1.18,(glyph.codePointAt(0)??0)>=0x2e80?style.size/72*1.1:0);
    if(advance>width)appendixFailure('appendix-fit');
    if(part&&used+advance>width){result.push(part);part='';used=0;}
    part+=glyph;used+=advance;
  }
  if(part)result.push(part);return result;
}
export function compileSourceAppendix(references: readonly AppendixReference[], design: DesignSystem, input: {
  revision: number; existingScenes: number; reservedIds: readonly string[];
}): SlideScene[] {
  if(!Array.isArray(references)||references.length>APPENDIX_LIMITS.references||!Number.isSafeInteger(input.revision)||input.revision<0||!Number.isInteger(input.existingScenes)||input.existingScenes<1||input.existingScenes>120||input.reservedIds.length>100000)appendixFailure('appendix-capacity');
  if(!references.length)return [];
  for(const r of references)if(typeof r.title!=='string'||!r.title.length||r.title.length>500||!scalar(r.title)||typeof r.url!=='string'||r.url.length>2000||!r.url.length||!scalar(r.url)||!Array.isArray(r.slides)||!r.slides.length||r.slides.length>120||new Set(r.slides).size!==r.slides.length||r.slides.some((n: number)=>!Number.isInteger(n)||n<1||n>input.existingScenes))appendixFailure('invalid-request');
  const {run:base,fit}=resolveRunStyle(design,'body');
  const size=Math.max(12,base.size,floorOf(fit)??0),line=Math.max(1.2,base.line),lineH=size/72*line;
  const body:ResolvedRun={...base,size,line};delete body.transform;
  const label={...body,bold:true,weight:700};
  const {run:heading}=resolveRunStyle(design,'heading');delete heading.transform;
  heading.size=Math.max(22,heading.size);heading.line=Math.max(1.2,heading.line);
  const margin=design.grid.margins,x=Math.max(.45,margin.left),right=Math.max(.45,margin.right),top=Math.max(.35,margin.top),bottom=SCENE_H-Math.max(.45,margin.bottom);
  const width=SCENE_W-x-right,headingH=heading.size/72*heading.line*1.2;
  const notice={...body,size:Math.max(12,floorOf({...fit,_role:'caption'})??12),role:'caption'};
  notice.line=Math.max(1.2,line);const noticeH=notice.size/72*notice.line;
  const start=top+headingH+.18,end=bottom-noticeH-.12;
  if(!Number.isFinite(width)||width<2||!Number.isFinite(lineH)||lineH<=0||end-start<lineH*4)appendixFailure('appendix-fit');
  const taken=new Set(input.reservedIds);let namespace='';
  const occupied=new Set<string>(),prefix=`references-r${input.revision}-`;
  for(const id of taken)if(id.startsWith(prefix)){const match=/^(\d+)(?:[-:]|$)/.exec(id.slice(prefix.length));if(match)occupied.add(match[1]);}
  for(let n=0;n<=10000;n++){if(!occupied.has(String(n))){namespace=prefix+n;break;}}
  if(!namespace)appendixFailure('appendix-capacity');
  const pages:SlideScene[]=[];let page:SlideScene,y=0,nodes=0;
  function text(text:string,at:number,h:number,run:ResolvedRun,semanticRef:string){
    if(++nodes>APPENDIX_LIMITS.nodes)appendixFailure('appendix-capacity');
    const el:SceneElement={id:`${page.id}:text-${page.elements.length}`,kind:'text',x,y:at,w:width,h,z:10,provenance:'compiler',semanticRef,paragraphs:[{align:'left',runs:[{...run,text}]}]};
    if(taken.has(el.id))appendixFailure('appendix-capacity');page.elements.push(el);
  }
  function next(){
    if(pages.length>=Math.min(APPENDIX_LIMITS.pages,120-input.existingScenes))appendixFailure('appendix-capacity');
    page={id:`${namespace}-p${pages.length+1}`,width:SCENE_W,height:SCENE_H,background:{fill:design.palette.bg.hex},layoutState:'managed',recipeId:APPENDIX_FORMAT,elements:[]};
    if(taken.has(page.id))appendixFailure('appendix-capacity');pages.push(page);y=start;
    text('',top,headingH,{...heading,bold:true},'references-heading');
    const noticeText='Claim support is not assessed.';
    if(measure(noticeText,notice)>width*.9)appendixFailure('appendix-fit');
    text(noticeText,bottom-noticeH,noticeH*1.05,notice,'references-notice');
  }
  next();
  references.forEach((r,index)=>{
    const chunks=[...lines(literalReferenceText(r.title),width,body).map(text=>({text,kind:'title'})),...lines(literalReferenceText(r.url),width,body).map(text=>({text,kind:'url'}))];
    let offset=0,continued=false;
    while(offset<chunks.length){
      const captions=lines(`[${index+1}]${continued?' (continued)':''} · Saved slides ${r.slides.join(', ')} (at creation)`,width,label);
      const labelHeight=captions.length*lineH;
      if(end-start<labelHeight+lineH)appendixFailure('appendix-fit');
      if(end-y<labelHeight+lineH){next();continue;}
      captions.forEach((s,i)=>text(s,y+i*lineH,lineH,label,`reference-${index+1}-label`));y+=labelHeight;
      const count=Math.min(chunks.length-offset,Math.floor((end-y)/lineH));if(count<1)appendixFailure('appendix-fit');
      for(let i=0;i<count;i++){const item=chunks[offset+i];text(item.text,y,lineH,body,`reference-${index+1}-${item.kind}`);y+=lineH;}
      offset+=count;y+=lineH*.4;if(offset<chunks.length){continued=true;next();}
    }
  });
  for(let i=0;i<pages.length;i++){
    const title=`References · ${i+1} / ${pages.length}`;
    if(measure(title,heading)>width*.9)appendixFailure('appendix-fit');pages[i].elements[0].paragraphs![0].runs[0].text=title;
  }
  const output=JSON.stringify(pages);if(new TextEncoder().encode(output).length>APPENDIX_LIMITS.bytes)appendixFailure('appendix-capacity');return pages;
}
