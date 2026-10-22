import json,os,pathlib,re,shutil
root=pathlib.Path('docs/v2-8g-evidence');out=pathlib.Path(os.environ.get('FORGE_VALIDATION_OUT','out/v2-8g-validation'));plan=json.loads((root/'validation-plan.json').read_text());sha=plan['implementationSha'];runs=json.loads((out/'coordinator.json').read_text());byname={r['name']:r for r in runs};logs=root/'logs';logs.mkdir(exist_ok=True)
assert all(r['implementationSha']==sha for r in runs)
def write(name,data):(root/name).write_text(json.dumps(data,indent=2)+'\n')
def group(id,selected,backend):
 rows=[byname[name] for name in selected];assert all(r['exitCode']==0 for r in rows)
 log=logs/(id+'.tap');log.write_text('\n'.join(pathlib.Path(r['log']).read_text() for r in rows))
 totals={key:sum(r['tests'][key] for r in rows) for key in ['total','pass','fail','skip','cancelled']};assert not any(totals[k] for k in ['fail','skip','cancelled'])
 write(id+'.json',{'id':id,'kind':'tests','implementationSha':sha,'command':'python3 docs/v2-8g-evidence/run-validation.py; exact isolated commands retained in logs/coordinator.json','log':str(log),'exitCode':0,'tests':totals,'files':[f for row in rows for f in row['files']],'backend':backend})
group('model-provider-focused',['focused'],'Injected transports, actual loopback protocol fixtures and temporary SQLite; no real model API or local inference')
group('model-provider',['focused','v2-provider-postgres-8c.test'],'Both provider families through injected/loopback fixtures and temporary SQLite/owned PostgreSQL durable contracts; repeats overlap the full matrix')
group('non-browser-bulk',['bulk'],'Pure domain and temporary SQLite stores; selected tests use their isolated backends')
group('serial-browser',[pathlib.Path(f).stem for f in plan['serial']],'Temporary SQLite production routes, isolated PostgreSQL browser suite and standalone fixtures')
group('postgres-contract',['v2-projects-6c-postgres.test','v2-import-postgres-7b.test'],'Owned isolated PostgreSQL15.18; designated23-case project/import contract gate')
group('postgres-complete',[pathlib.Path(f).stem for f in plan['postgres']],'Owned isolated PostgreSQL15.18; all eight files. Designated contract23 and cross-process/fault19 are overlapping subsets.')
group('cross-process-faults',['v2-projects-6c-concurrency.test','v2-projects-6c-faults.test'],'Isolated PostgreSQL15; actual independent processes and injected faults')
for name in ['production-build','typecheck','benchmark-50']:
 row=byname[name];assert row['exitCode']==0;log=logs/(name+'.log');shutil.copy2(row['log'],log)
 data={'id':name,'kind':'benchmark' if name=='benchmark-50' else 'command','implementationSha':sha,'command':' '.join(row['command']),'log':str(log),'exitCode':0,'durationSeconds':row['durationSeconds']}
 if name=='benchmark-50':
  result=json.loads(pathlib.Path('out/v2-8g-benchmark/results.json').read_text());assert len(result['cells'])==50;data['cells']=50;shutil.copy2('out/v2-8g-benchmark/results.json',root/'benchmark-results.json')
 write(name+'.json',data)
full=[byname['bulk']]+[byname[pathlib.Path(f).stem] for f in plan['serial']+plan['postgres']]
assert sum(len(r['files']) for r in full)==224
write('full-matrix.json',{'implementationSha':sha,'files':224,'tests':{key:sum(r['tests'][key] for r in full) for key in ['total','pass','fail','skip','cancelled']},'repeatedFocused':byname['focused']['tests'],'fullRuns':[r['name'] for r in full],'standingByokLocale':byname['byok-locale']['tests'],'unexecuted':0})
if 'window-qualification' in byname:
 result=json.loads((root/'full-matrix.json').read_text());result['repeatedResourceQualification']=byname['window-qualification']['tests'];write('full-matrix.json',result)
for row in runs:
 if row['name'] not in ['bulk','focused'] and row['files']:
  folder=logs/'files';folder.mkdir(exist_ok=True);shutil.copy2(row['log'],folder/(row['name']+'.tap'))
for name in ['headless','native-review','shell-native','stream-resources']:
 assert byname[name]['exitCode']==0;shutil.copy2(byname[name]['log'],logs/(name+'.log'))
headless=pathlib.Path(byname['headless']['log']).read_text();assert re.search(r'^# tests 4$',headless,re.M) and re.search(r'^# pass 4$',headless,re.M)
shutil.copy2(out/'coordinator.json',logs/'coordinator.json');shutil.copy2(out/'coordinator.log',logs/'coordinator.log');(root/'recovery-metrics.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in [json.loads(line) for line in (out/'recovery-metrics.jsonl').read_text().splitlines() if line] if row['source']==sha))
for name in ['resource-window.jsonl','storage-window.jsonl','quiet-restart.jsonl']:
 if (out/name).exists():shutil.copy2(out/name,root/name)
print(json.dumps(json.loads((root/'full-matrix.json').read_text()),indent=2))
