import json,pathlib,shutil,hashlib,datetime,sys
root=pathlib.Path('docs/v2-7c-3-evidence');out=pathlib.Path('out/v2-7c-3-validation');sha=json.loads((root/'validation-plan.json').read_text())['implementationSha'];runs=json.loads((out/'coordinator.json').read_text());phase=sys.argv[1]
def run_time(name):
 run=next(r for r in runs if r['name']==name);assert run['exitCode']==0;assert run['implementationSha']==sha;return datetime.datetime.fromisoformat(run['atUtc']).timestamp()
def copy(sources,folder,since,backend):
 folder=root/'measurements'/folder;folder.mkdir(parents=True,exist_ok=True)
 if (folder/'provenance.json').exists():
  for name in {r['path'] for r in json.loads((folder/'provenance.json').read_text())}:
   p=pathlib.Path(name)
   if p.exists():p.unlink()
 records=[]
 for source in sources:
  if source.stat().st_mtime<since:continue
  destination=folder/(source.parts[1]+'--'+source.name);shutil.copy2(source,destination);records.append({'source':str(source),'path':str(destination),'implementationSha':sha,'backend':backend,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
 assert len({r['path'] for r in records})==len(records)
 (folder/'provenance.json').write_text(json.dumps(records,indent=2)+'\n');print(folder,len(records))
if phase=='sqlite':
 start=run_time('serial-driver');sources=[*pathlib.Path('docs/v2-7a-evidence').glob('canvas-*.json'),pathlib.Path('docs/v2-7a-evidence/large-deck.json')]
 for directory in ['out/v2-7b-1-validation/browser','out/v2-7b-2-validation/browser','out/v2-7c-1-validation/browser','out/v2-7c-2-validation/browser']:sources.extend(pathlib.Path(directory).glob('*.json'))
 copy(sources,'sqlite-regressions',start,'SQLite')
 copy(list((out/'sqlite-toolbar-measurements').glob('*.json')),'sqlite-toolbar',start,'SQLite production projects and standalone local Live')
elif phase=='postgres':
 copy(list(pathlib.Path('out/v2-7c-1-validation/browser').glob('*.json')),'postgres-covers',run_time('postgres-covers-final'),'PostgreSQL')
 copy(list((out/'browser').glob('*.json')),'postgres-toolbar',run_time('postgres-toolbar-final'),'PostgreSQL saved-project cases; standalone local SQLite')
 copy(list(pathlib.Path('out/v2-7c-2-validation/browser').glob('*.json')),'postgres-catalog',run_time('postgres-catalog-final'),'PostgreSQL projects; legacy filesystem catalog')
 copy([out/'hosted-import-measurements.json'],'postgres-hosted',run_time('hosted-import-final'),'PostgreSQL')
else:raise ValueError(phase)
