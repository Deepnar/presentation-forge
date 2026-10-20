import datetime,importlib.util,json,os,pathlib,re,signal,subprocess,time
ROOT=pathlib.Path('docs/v2-8c-evidence/independent');OUT=pathlib.Path('out/v2-8c-independent');SHA='e41d509c20fca21a70b9a0c587ccb83684aee7e6'
spec=importlib.util.spec_from_file_location('quiet','docs/v2-8c-evidence/quiet_window.py');quiet=importlib.util.module_from_spec(spec);spec.loader.exec_module(quiet);quiet.OUT=OUT
window=quiet.Window();runs=json.loads((ROOT/'runs.json').read_text());assert len(runs)==10 and all(r['exitCode']==0 for r in runs)
env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','LC_ALL':'C.UTF-8','TEST_PG_URL':'postgres://postgres:probe@127.0.0.1:5544/postgres','FORGE_RUNTIME_SOURCE':SHA,'FORGE_RUNTIME_METRICS_PATH':str((ROOT/'recovery-metrics.jsonl').resolve())}
commands=[('negative-probes',['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs','docs/v2-8c-evidence/independent/negative-probes.mjs'],['docs/v2-8c-evidence/independent/negative-probes.mjs']),('shell-native',['node','docs/v2-8c-evidence/independent/shell-native.mjs'],[])]
(ROOT/'supplement-plan.json').write_text(json.dumps({'implementationSha':SHA,'jobs':[{'name':n,'args':a,'files':f} for n,a,f in commands],'bounds':'Each process-group job15m TERM watchdog,10s KILL grace; all jobs sequential; initial180s measured headroom and two fresh15s acceptable samples per job; ongoing15s samples,3critical samples stop only owned job. Global PSI/iowait remains unresolved.'},indent=2)+'\n')
window.wait(30)
for name,args,files in commands:
 window.wait(30);log=ROOT/(name+'.log');command=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args];started=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat();print(name,'START',flush=True)
 with log.open('w') as stream:
  process=subprocess.Popen(command,stdout=stream,stderr=subprocess.STDOUT,env=env,start_new_session=True);critical=0;stopped=False
  try:
   while True:
    try:process.wait(timeout=15);break
    except subprocess.TimeoutExpired:
     row=window.observe('running:'+name);critical=critical+1 if row['critical'] else 0;print(name,'RUNNING',round(time.monotonic()-started),'critical',critical,flush=True)
     if critical>=3:stopped=True;os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=10);break
  except BaseException:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
   raise
 row={'name':name,'implementationSha':SHA,'command':command,'files':files,'log':str(log),'exitCode':process.returncode,'durationSeconds':time.monotonic()-started,'atUtc':at,'resourceStopped':stopped}
 text=log.read_text()
 if files:row['tests']={key:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for key,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
 runs.append(row);(ROOT/'runs.json').write_text(json.dumps(runs,indent=2)+'\n');print(name,'EXIT',row['exitCode'],row.get('tests',''),flush=True)
 if row['exitCode'] or files and any(row['tests'][k] for k in ['fail','skip','cancelled']):raise SystemExit(1)
print('Independent execution complete; inspection/restoration/decision pending.',flush=True)
