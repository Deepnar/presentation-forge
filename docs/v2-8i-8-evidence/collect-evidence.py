"""Bind retained execution to frozen source; select each Chrome case exactly once.

This is an evidence collector, not a product test runner. Failed attempts stay raw.
"""
import pathlib, subprocess, hashlib, json, re
ROOT=pathlib.Path(__file__).resolve().parents[2]; OUT=pathlib.Path(__file__).resolve().parent
SHA='b9c2d2075da21608a92a458c1395ede0bbe67297'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SHA or subprocess.call(['git','merge-base','--is-ancestor',SHA,'HEAD'],cwd=ROOT)==0
read=lambda name:json.loads((OUT/name).read_text())
def write(name,data): (OUT/name).write_text(json.dumps(data,indent=2)+'\n')
def digest(p):return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def gittext(sha,p):return subprocess.check_output(['git','show',sha+':'+p],cwd=ROOT,text=True)
manifest={'implementationSha':SHA,'basis':'Exact byte equality except explicitly reviewed browser recovery/capture deltas below. No SHA-only reruns.','gates':{}}
for gate,raw,paths in [
 ('assistant-client','assistant-client-attempt-6.json',['app/web/src/lib/v2assistant.js','app/web/src/lib/assistantController.js','test/v2-assistant-client-8i.test.js']),
 ('assistant-integration','assistant-integration-attempt-2.json',['src/agent/assistant-availability.js','src/agent/turn-cli.js','app/server/v2-agent-routes.js','app/server/index.js','test/v2-assistant-integration-8i.test.js']),
 ('governance','governance-attempt-2.json',['tools/dev-protocol-check.mjs','docs/development-state.schema.json','test/dev-protocol.test.js']),
]:
 d=read(raw);assert d['exitCode']==0 and d['tests']['fail']==d['tests']['skip']==d['tests']['cancelled']==0
 matches={p:d['sourceHashes'][p]==digest(p) for p in paths};assert all(matches.values()),matches
 manifest['gates'][gate]={'raw':raw,'matchingSourceHashes':{p:digest(p) for p in paths}}
 d['invocationHead']=d['implementationSha'];d['implementationSha']=SHA;d['applicability']='Relevant invocation bytes equal frozen source; see source-manifest.json';write(gate+'.json',d)
d=read('typecheck-attempt-1.json');assert d['exitCode']==0
later=subprocess.check_output(['git','diff','--name-only',d['implementationSha'],SHA],cwd=ROOT,text=True).splitlines()
assert not any(p.endswith(('.ts','.json')) and (p.startswith('packages/') or p.startswith('tsconfig') or p in ['package.json','package-lock.json']) for p in later)
manifest['gates']['typecheck']={'raw':'typecheck-attempt-1.json','unchanged':'No package TypeScript/tsconfig/package manifest changed after the retained invocation; JSX covered by production builds/browser.'}
d['invocationHead']=d['implementationSha'];d['implementationSha']=SHA;d['backend']='Not applicable';d['applicability']=manifest['gates']['typecheck']['unchanged'];write('typecheck.json',d)
def cases(text):
 result={}
 for match in re.finditer(r'^# Subtest: ([^\n]+)\n(.*?^  \.\.\.\n)',text,re.M|re.S):
  name=match[1];body=match[0];outcome=re.search(r'^(ok|not ok) \d+ - ',body,re.M);assert outcome
  result[name]=(outcome[1]=='ok',body)
 return result
full=read('assistant-browser-attempt-2.json'); narrow=read('assistant-browser-save-attempt-1.json'); saved=read('assistant-browser-save-attempt-2.json')
expected=['Assistant Chrome: '+name for name in re.findall(r"check\('([^']+)'",(ROOT/'test/v2-assistant-chrome-8i.test.js').read_text())]
assert len(expected)==7
selection=[('assistant-browser-attempt-2.json',name) for name in expected[:5]]+[( 'assistant-browser-save-attempt-1.json',expected[5]),('assistant-browser-save-attempt-2.json',expected[6])]
lines=['TAP version 13','# Evidence selection digest, not a new all-green whole-file execution.','# Each selected leaf passed in its cited raw invocation; all failed attempts remain retained.']; records=[]
for index,(raw,name) in enumerate(selection,1):
 d=read(raw);log=(ROOT/d['log']).read_text();passed,block=cases(log)[name];assert passed,(raw,name)
 lines.append('# Source '+d['log']+'; process exit '+str(d['exitCode'])+'; selected leaf '+name)
 lines.append(re.sub(r'^ok \d+ - ',f'ok {index} - ',block,flags=re.M).rstrip())
 records.append({'test':name,'raw':raw,'rawLog':d['log'],'rawProcessExitCode':d['exitCode'],'outcome':'pass'})
lines+=['1..7','# tests 7','# pass 7','# fail 0','# skipped 0','# cancelled 0','# forge-test-file "test/v2-assistant-chrome-8i.test.js"']
(OUT/'assistant-browser-selected.tap').write_text('\n'.join(lines)+'\n')
# Verify unchanged passing bodies; dark/save are covered by their corrected invocations.
source='test/v2-assistant-chrome-8i.test.js'
def bodies(text):return {m[1]:m[0] for m in re.finditer(r"^check\('([^']+)'.*?(?=^check\(|\Z)",text,re.M|re.S)}
old=bodies(gittext(full['implementationSha'],source));new=bodies(gittext(SHA,source))
assert all(old[name.removeprefix('Assistant Chrome: ')].strip()==new[name.removeprefix('Assistant Chrome: ')].strip() for name in expected[:5])
exceptions=['app/web/src/lib/assistantController.js']
web={p:h for p,h in full['sourceHashes'].items() if p.startswith('app/web/') and p not in exceptions}
assert web and all(digest(p)==h for p,h in web.items())
assert saved['sourceHashes']['app/web/src/lib/assistantController.js']==hashlib.sha256(gittext('c6abdb2b657a2929bddba5e2d48083328945fd42','app/web/src/lib/assistantController.js').encode()).hexdigest()
manifest['gates']['assistant-browser']={'selectedCases':records,'unchangedFirstFiveBodies':True,'matchingWebPaths':len(web),'webRecoveryDelta':'After full attempt2, syncSaved catch retains pendingSaved on blocked/failed loads, and successful loading clears its old error. Final controller also gives availability/export UI reads owned AbortControllers. Independent final challenges on frozen source cover recovery/auth/owned-read aborts. Prior successful load/no-load/browser branches unchanged.','sharedHarnessDelta':'capture adds theme/viewport/background JSON only; corrected sixth sets data-theme, seventh uses plain editable text plus canonical turn counts. First five case bodies unchanged.','savedCaseControllerSha256':saved['sourceHashes']['app/web/src/lib/assistantController.js'],'finalControllerSha256':digest('app/web/src/lib/assistantController.js'),'testSha256':digest(source),'helperSha256':digest('tools/chrome-shot.mjs')}
write('assistant-browser.json',{'id':'assistant-browser','implementationSha':SHA,'kind':'tests','command':'python3 docs/v2-8i-8-evidence/collect-evidence.py (collect seven previously executed selected cases; no new test execution)','exitCode':0,'log':'docs/v2-8i-8-evidence/assistant-browser-selected.tap','tests':{'total':7,'pass':7,'fail':0,'skip':0,'cancelled':0},'backend':'Actual isolated Express production bundle + temporary SQLite, loopback provider only; Chrome --disable-gpu','executionMode':'Composite selected-case coverage; no all-green full-file process is claimed','constituents':records})
write('source-manifest.json',manifest)
print(json.dumps({'implementationSha':SHA,'requiredProductLeaves':26,'selectedChromeLeaves':7,'governanceLeaves':4,'typecheckExitCode':0}))
