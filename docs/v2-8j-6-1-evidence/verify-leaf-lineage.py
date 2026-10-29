import json,hashlib,re,subprocess
from pathlib import Path
base=Path('docs/v2-8j-6-1-evidence');manifest=json.loads((base/'manifest.json').read_text());digest=lambda s:hashlib.sha256(s.encode()).hexdigest()
record={'method':'Post-run reconstruction, not an original source capture. Each reconstructed whole file must exactly match its contemporaneous invocation SHA256 before selected leaf body comparisons. No product test execution.','reconstructedFiles':[],'selectedLeaves':[]}
for gate in manifest['selected'].values():
 for title,leaf in gate['selection'].items():
  file=leaf['file'];run=Path(leaf['invocation']).stem;meta=json.loads(Path(leaf['invocation']).read_text());current=Path(file).read_text();old=current;proof='whole file hash matches invocation'
  if run in ['domain-01','native-01']:
   old=(base/(run+'-reconstructed-source.js.txt')).read_text();proof='reversed bounded fixture edits; exact whole-file SHA256 matches original invocation'
  elif run=='domain-02':old=current.split("test('notes domain: complete traversal")[0];proof='remove only two later appended tests; exact whole-file SHA256 matches invocation'
  elif run=='native-02':old=current.split("test('notes native: slide citations require")[0];proof='remove only later appended regression; exact whole-file SHA256 matches invocation'
  captured=meta['sourceHashes'].get(file)
  if captured is None:
   assert file=='test/v2-renderer-pptx.test.js' and file not in meta['trackedDelta']
   old=subprocess.check_output(['git','show',meta['invocationHead']+':'+file],text=True);captured=digest(old);proof='unchanged tracked file: not in captured dirty-path inventory, invocation HEAD blob equals final source'
  assert digest(old)==captured,(file,run,'reconstructed bytes do not match invocation')
  if old!=current:
   out=base/(run+'-reconstructed-source.js.txt');out.write_text(old)
   row={'invocation':leaf['invocation'],'file':file,'reconstructedPath':str(out),'capturedSha256':captured,'reconstructedSha256':digest(old),'proof':proof}
   if row not in record['reconstructedFiles']:record['reconstructedFiles'].append(row)
  def body(source,name):
   matches=list(re.finditer(r"^test\('([^']+)'",source,re.M))
   for i,m in enumerate(matches):
    if m[1]==name:return source[m.start():matches[i+1].start() if i+1<len(matches) else len(source)].rstrip()
   return source
  oldBody=body(old,title);currentBody=body(current,title)
  assert digest(oldBody)==digest(currentBody),(title,'selected passing leaf changed')
  record['selectedLeaves'].append({'title':title,'file':file,'invocation':leaf['invocation'],'selectedBodySha256':digest(oldBody),'finalBodySha256':digest(currentBody),'equal':True,'wholeFileProof':proof})
# Runtime deltas are explicit, with complete current-byte hashes pinned by later narrow checks.
record['runtimeApplicability']={
 'unchangedRuntime':['packages/renderer-pptx/render.ts','src/projects/citation-export.js','src/projects/export-file.js'],
 'sourceNotesDelta':{'path':'packages/renderer-pptx/source-notes.ts','change':'One emitted-authored-scope guard after original freeze; notes-unsafe for empty/chrome-only slide citations.','finalEvidence':['native-empty-fix-01','typecheck-02'],'visualApplicability':'Valid mixed export still has identical native scene XML to uncited control; guard only adds refusal for empty scopes. Retained raster evidence is not a rerender claim.'},
 'cliDelta':{'path':'src/projects/export-cli.js','change':'Sanitized shutdown errors, preserving unknown complete-file outcome after publication.','finalEvidence':['cli-close-01'],'unchangedBranches':'Argument/auth/inspection/snapshot/consent/render/publication branches unchanged; original passing related cases retained.'},
 'helperApplicability':'New pureFixture/anchor/registerCited fixtures and imported project/source helper bytes were unchanged across the relevant selected invocations. native-01 mixedFixture helper changed only for three failed leaves, all rerun; retained successful capacity/tamper leaf does not call it.'}
for file in record['runtimeApplicability']['unchangedRuntime']:
 assert json.loads((base/'domain-01.json').read_text())['sourceHashes'][file]==hashlib.sha256(Path(file).read_bytes()).hexdigest()
for run,file in [('native-empty-fix-01','packages/renderer-pptx/source-notes.ts'),('typecheck-02','packages/renderer-pptx/source-notes.ts'),('cli-close-01','src/projects/export-cli.js')]:
 assert json.loads((base/(run+'.json')).read_text())['sourceHashes'][file]==hashlib.sha256(Path(file).read_bytes()).hexdigest()
(base/'leaf-lineage.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'selectedLeaves':len(record['selectedLeaves']),'allEqual':True,'reconstructedFiles':len(record['reconstructedFiles'])}))
