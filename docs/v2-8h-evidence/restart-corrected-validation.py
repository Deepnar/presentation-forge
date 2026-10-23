import json, os, pathlib, subprocess, sys, time
from quiet_window import Window
root=pathlib.Path('docs/v2-8h-evidence')
out=pathlib.Path(os.environ['FORGE_VALIDATION_OUT'])
assert out != pathlib.Path('out/v2-8h-validation'), 'Retain failed-attempt records'
out.mkdir(parents=True,exist_ok=True)
sha=json.loads((root/'validation-plan.json').read_text())['implementationSha']
assert not (out/'coordinator.json').exists(), 'Do not overwrite an existing corrected run'
subprocess.run(['git','diff','--quiet',sha,'--','packages','src','test','app','tools','schema','themes','package.json','package-lock.json','tsconfig.json'],check=True)
qualification=json.loads((out/'sustained-window.json').read_text())
assert qualification['implementationSha']==sha and qualification['sampleSeconds']>=180
assert time.time()-(out/'sustained-window.json').stat().st_mtime<300
Window().wait(30)
owned=json.loads((root/'owned-postgres.json').read_text())
meta=json.loads(subprocess.check_output(['docker','inspect',owned['id']],text=True))[0]
assert meta['Id']==owned['id'] and meta['Name']=='/'+owned['name'] and meta['Image']==owned['imageId'] and meta['State']['Running']
assert meta['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(owned['port'])}]
databases=subprocess.check_output(['docker','exec',owned['id'],'psql','-U','postgres','-d','postgres','-At','-c',"SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname"],text=True).splitlines()
assert databases==[], 'Prior attempt left databases; inspect/clean owned test data before continuing'
record={'implementationSha':sha,'recordedContainerId':owned['id'],'name':owned['name'],'imageId':owned['imageId'],'port':owned['port'],'running':True,'nonMaintenanceDatabases':databases,'qualifiedWindow':str(out/'sustained-window.json'),'reusesOriginalPreTestSnapshot':True}
with (root/f'corrected-owned-backend-{sha[:7]}.json').open('x') as stream:
 json.dump(record,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
for name in ['backup','prior-generated-backup']:
 original=pathlib.Path('out/v2-8h-validation')/name
 assert (original/'index.json').is_file()
 target=out/name
 assert not target.exists(), 'Preserve existing snapshot link'
 target.symlink_to(original.resolve(),target_is_directory=True)
raise SystemExit(subprocess.run([sys.executable,'-u',str(root/'run-validation.py'),*sys.argv[1:]]).returncode)
