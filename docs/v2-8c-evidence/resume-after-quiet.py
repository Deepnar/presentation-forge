import datetime, json, pathlib, re, subprocess, time
from quiet_window import Window

root = pathlib.Path('docs/v2-8c-evidence')
out = pathlib.Path('out/v2-8c-validation')
Window().wait(180)

assert not subprocess.check_output(['docker', 'ps', '-aq', '--filter', 'name=^/forge-v28c-validation$'], text=True).strip(), 'Owned name already exists; inspect before reuse'
container = subprocess.check_output(['docker', 'run', '--rm', '-d', '--name', 'forge-v28c-validation', '--cpus', '1', '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw,size=192m', '-e', 'POSTGRES_PASSWORD=probe', '-p', '127.0.0.1:5544:5432', 'postgres:15-alpine'], text=True).strip()
info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
for attempt in range(30):
    if subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        break
    time.sleep(1)
else:
    raise RuntimeError('New owned PostgreSQL did not become ready')
version = subprocess.check_output(['docker', 'exec', container, 'psql', '-U', 'postgres', '-Atc', 'show server_version'], text=True).strip()
record = {'id': container, 'name': info['Name'].lstrip('/'), 'port': 5544, 'createdAtUtc': info['Created'], 'image': info['Config']['Image'], 'imageId': info['Image'], 'autoRemove': info['HostConfig']['AutoRemove'], 'cpus': 1, 'memoryBytes': info['HostConfig']['Memory'], 'tmpfs': info['HostConfig']['Tmpfs'], 'version': version, 'reason': 'Replacement for owned auto-remove/tmpfs service lost during host restart', 'implementationSha': json.loads((root / 'validation-plan.json').read_text())['implementationSha']}
for file in [root / 'owned-postgres-restarted.json', out / 'owned-postgres-restarted.json']:
    file.write_text(json.dumps(record, indent=2) + '\n')
print('New isolated owned PostgreSQL ready', container, version, flush=True)
raise SystemExit(subprocess.run(['python3', '-u', str(root / 'run-validation.py'), '--resume']).returncode)
