import datetime
import hashlib
import json
import os
import pathlib
import socket
import subprocess

from validation_guards import validate_source, validate_adoption

root = pathlib.Path('docs/v2-8i-4-corrected-evidence')
plan = json.loads((root/'validation-plan.json').read_text())
sha = plan['implementationSha']
validate_source(root, plan)
assert not (root/'owned-postgres.json').exists() and not (root/'source-correction-adoption.json').exists()
original_path = pathlib.Path('docs/v2-8i-4-evidence/attempts/175a016/frozen-records/docs/v2-8i-4-evidence/owned-postgres.json')
original_bytes = original_path.read_bytes()
assert original_bytes == pathlib.Path('docs/v2-8i-4-evidence/owned-postgres.json').read_bytes()
original = json.loads(original_bytes)
assert original['implementationSha'] == '175a0163618e4a8ffcd68c51224b8eaef4e01440'
assert original['id'] == 'e08ed2564f60da2fd9fffca5d57229d2f111640689a242f97f06d5a04ba571ce'
meta = json.loads(subprocess.check_output(['docker', 'inspect', original['id']], text=True))[0]
assert meta['Id'] == original['id'] and meta['Name'] == '/forge-v28i4-validation'
assert meta['Image'] == original['imageId'] and meta['State']['Running']
assert meta['HostConfig']['AutoRemove'] is True and meta['HostConfig']['NanoCpus'] == 1000000000
assert meta['HostConfig']['Memory'] == 536870912 and meta['HostConfig']['Tmpfs'] == original['tmpfs']
assert meta['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '5544'}]
with socket.create_connection(('127.0.0.1', 5544), timeout=1): pass
psql = ['docker', 'exec', '-e', 'PGPASSWORD=probe', original['id'], 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At', '-c']
version = subprocess.check_output([*psql, 'SHOW server_version'], text=True).strip()
assert version == '15.18'
query = "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname"
databases = subprocess.check_output([*psql, query], text=True).splitlines()
assert databases == [], databases
identity = {key: original[key] for key in ['id', 'name', 'port', 'imageId', 'autoRemove', 'cpus', 'memoryBytes', 'tmpfs']}
record = {'implementationSha': sha, 'previousImplementationSha': original['implementationSha'],
          'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'originalOwnershipRecord': str(original_path), 'originalOwnershipSha256': hashlib.sha256(original_bytes).hexdigest(),
          'identity': identity, 'sourceCorrectionOnly': True, 'nonMaintenanceDatabases': databases,
          'actualVersion': version, 'newContainerCreated': False, 'oldOwnershipReplaced': False,
          'priorOriginalsRestored': 'docs/v2-8i-4-evidence/attempts/175a016/retirement.json'}
owned = {**original, 'implementationSha': sha, 'adoptionRecord': str(root/'source-correction-adoption.json')}
for name, value in [('source-correction-adoption.json', record), ('owned-postgres.json', owned)]:
    with (root/name).open('x') as stream:
        json.dump(value, stream, indent=2); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
directory = os.open(root, os.O_RDONLY|os.O_DIRECTORY); os.fsync(directory); os.close(directory)
validate_adoption(root, sha, owned, meta)
print(json.dumps(record, indent=2))
