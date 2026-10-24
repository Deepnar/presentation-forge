import datetime,hashlib,json,os,pathlib,socket,subprocess,sys,time
assert sys.argv[1:]==['--after-review-database-checks']
root=pathlib.Path('docs/v2-8i-1-evidence');out=pathlib.Path(os.environ['FORGE_VALIDATION_OUT'])
sha=json.loads((root/'validation-plan.json').read_text())['implementationSha']
complete=json.loads((out/'coordinator-complete.json').read_text())
assert complete['implementationSha']==sha and complete['orderedExecutionComplete']
matrix=json.loads((root/'full-matrix.json').read_text())
assert matrix['implementationSha']==sha and matrix['unexecuted']==0 and matrix['files']==231
owned=json.loads((root/'owned-postgres.json').read_text())
meta=json.loads(subprocess.check_output(['docker','inspect',owned['id']],text=True))[0]
assert meta['Id']==owned['id'] and meta['Name']=='/'+owned['name'] and meta['Image']==owned['imageId'] and meta['State']['Running'] and meta['HostConfig']['AutoRemove']
assert meta['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(owned['port'])}]
query="SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname"
databases=subprocess.check_output(['docker','exec',owned['id'],'psql','-U','postgres','-d','postgres','-At','-c',query],text=True).splitlines()
assert databases==[], databases
before={'implementationSha':sha,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':owned['id'],'name':owned['name'],'imageId':owned['imageId'],'port':owned['port'],'runningBeforeStop':True,'databaseQuery':query,'nonMaintenanceDatabases':databases,'projectDatabaseCount':len(databases),'savedAndFsyncedBeforeStop':True}
def durable(path,data):
 with path.open('x') as f:
  json.dump(data,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 fd=os.open(str(path.parent),os.O_RDONLY);os.fsync(fd);os.close(fd)
beforepath=root/'owned-postgres-before-removal.json';durable(beforepath,before)
stopcommand=['docker','stop','--timeout','10',owned['id']]
stop=subprocess.run(stopcommand,capture_output=True,text=True,timeout=30)
observations=[];deadline=time.monotonic()+10
while True:
 inspect=subprocess.run(['docker','inspect',owned['id']],capture_output=True,text=True)
 remaining=subprocess.check_output(['docker','ps','-aq','--no-trunc','--filter','id='+owned['id']],text=True).splitlines()
 refused=False
 try:
  connection=socket.create_connection(('127.0.0.1',owned['port']),timeout=1);connection.close()
 except ConnectionRefusedError:refused=True
 absent=inspect.returncode!=0 and remaining==[]
 observations.append({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exactIdAbsent':absent,'portConnectionRefused':refused})
 if absent and refused or time.monotonic()>=deadline:break
 time.sleep(0.2)
record={'implementationSha':sha,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':owned['id'],'beforeRemovalRecord':str(beforepath),'beforeRemovalSha256':hashlib.sha256(beforepath.read_bytes()).hexdigest(),'freshSavedProjectDatabaseCount':0,'stop':{'command':stopcommand,'exitCode':stop.returncode,'stdout':stop.stdout,'stderr':stop.stderr},'exactIdAbsent':absent,'port':owned['port'],'portConnectionRefused':refused,'postStopObservations':observations,'unrelatedServicesModified':False}
durable(root/'owned-postgres-cleanup.json',record)
assert record['exactIdAbsent'] and refused
print(json.dumps(record,indent=2))
