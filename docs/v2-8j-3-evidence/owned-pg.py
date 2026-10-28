"""Own a fresh isolated fixture service; never inspect or stop unrelated services."""
import pathlib,json,subprocess,tempfile,secrets,datetime,time,os,sys
OUT=pathlib.Path(__file__).resolve().parent
PUBLIC=OUT/'owned-postgres.json'
def run(args,timeout=15): return subprocess.check_output(args,text=True,timeout=timeout).strip()
def write(path,value):
 with path.open('w') as f:json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def inspect(identity):return json.loads(run(['docker','inspect',identity]))[0]
if sys.argv[1]=='start':
 assert not PUBLIC.exists(),'Owned fixture already recorded; inspect instead of starting another.'
 admission=json.loads((OUT/'sqlite-admission.json').read_text());assert admission['admitted']
 assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(admission['samples'][-1]['atUtc'])).total_seconds()<60
 name='forge-j3-validation-'+secrets.token_hex(5);password=secrets.token_urlsafe(24)
 identity=run(['docker','run','--pull=never','-d','--name',name,'--cpus=1','--memory=512m','--pids-limit=128','--tmpfs','/var/lib/postgresql/data:rw,size=256m','-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'postgres:15-alpine'])
 details=inspect(identity);port=details['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']
 fd,private=tempfile.mkstemp(prefix='forge-j3-private-',suffix='.json');os.close(fd);os.chmod(private,0o600)
 write(pathlib.Path(private),{'id':identity,'url':f'postgres://postgres:{password}@127.0.0.1:{port}/postgres'})
 public={'id':identity,'name':name,'imageId':details['Image'],'host':'127.0.0.1','port':int(port),'privateStatePath':private,'scope':'New isolated J3 fixture only; never old I4 or another project database. Temporary tmpfs storage, no production durability claim.','startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 write(PUBLIC,public)
 deadline=time.monotonic()+20
 while time.monotonic()<deadline:
  try:
   run(['docker','exec',identity,'pg_isready','-h','127.0.0.1','-U','postgres'],2);break
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired):time.sleep(.25)
 else:raise RuntimeError('Owned fixture startup incomplete; retain identity and inspect it, never start a duplicate.')
 initial=run(['docker','exec',identity,'psql','-U','postgres','-Atc',"SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1') ORDER BY datname"]).splitlines()
 public['initialDatabaseCatalog']=initial;write(PUBLIC,public);assert not initial
 print(json.dumps({'ready':True,'id':identity,'port':int(port),'initialDatabaseCount':len(initial)}))
elif sys.argv[1]=='stop':
 public=json.loads(PUBLIC.read_text());identity=public['id'];current=inspect(identity)
 assert current['Id']==identity and current['Name']=='/'+public['name'] and current['Image']==public['imageId'] and current['State']['Running']
 query="SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1') ORDER BY datname"
 databases=run(['docker','exec',identity,'psql','-U','postgres','-Atc',query]).splitlines()
 observation={'id':identity,'databasesBeforeStop':databases,'count':len(databases),'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'procedure':'Saved and fsynced actual catalog before exact-ID removal. No inferred prior count.'}
 write(OUT/'owned-postgres-cleanup.json',observation)
 assert not databases,'Fixture databases remain; inspect owned test teardown before stopping.'
 run(['docker','rm','-f',identity]);remaining=run(['docker','ps','-aq','--no-trunc','--filter','id='+identity])
 observation['exactIdAbsent']=not remaining;write(OUT/'owned-postgres-cleanup.json',observation)
 assert observation['exactIdAbsent'];pathlib.Path(public['privateStatePath']).unlink()
 print(json.dumps({'removed':identity,'savedActualDatabaseCount':0,'exactIdAbsent':True}))
else:raise ValueError('start or stop required')
