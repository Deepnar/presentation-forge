import datetime
import hashlib
import json
import os
import pathlib
import socket
import subprocess

root = pathlib.Path('docs/v2-8i-3-evidence')
owned = json.loads((root / 'owned-postgres.json').read_text())
before_path = root / 'owned-postgres-before-removal.json'
initial_path = root / 'owned-postgres-cleanup.json'
before = json.loads(before_path.read_text())
initial = json.loads(initial_path.read_text())
sha = json.loads((root / 'validation-plan.json').read_text())['implementationSha']
assert before['implementationSha'] == initial['implementationSha'] == sha
assert before['id'] == initial['id'] == owned['id']
assert before['projectDatabaseCount'] == 0 and before['nonMaintenanceDatabases'] == []
assert before['savedAndFsyncedBeforeStop'] and before['runningBeforeStop']
assert hashlib.sha256(before_path.read_bytes()).hexdigest() == initial['beforeRemovalSha256']
assert initial['stop']['exitCode'] == 0

inspection = subprocess.run(['docker', 'inspect', owned['id']], capture_output=True, text=True)
remaining = subprocess.check_output([
    'docker', 'ps', '-aq', '--no-trunc', '--filter', 'id=' + owned['id']
], text=True).splitlines()
refused = False
try:
    connection = socket.create_connection(('127.0.0.1', owned['port']), timeout=1)
    connection.close()
except ConnectionRefusedError:
    refused = True

record = {
    'implementationSha': sha,
    'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'id': owned['id'],
    'port': owned['port'],
    'beforeRemovalRecord': str(before_path),
    'beforeRemovalSha256': hashlib.sha256(before_path.read_bytes()).hexdigest(),
    'initialCleanupRecord': str(initial_path),
    'initialCleanupSha256': hashlib.sha256(initial_path.read_bytes()).hexdigest(),
    'firstPostStopObservation': initial['postStopObservations'][0],
    'boundedCleanupExactIdAbsent': initial['exactIdAbsent'],
    'boundedCleanupPortConnectionRefused': initial['portConnectionRefused'],
    'inspectExitCode': inspection.returncode,
    'inspectStderr': inspection.stderr,
    'matchingContainerIds': remaining,
    'exactIdAbsent': inspection.returncode != 0 and remaining == [],
    'portConnectionRefused': refused,
    'freshSavedProjectDatabaseCountBeforeStop': before['projectDatabaseCount'],
    'savedCountReconstructed': False,
    'additionalStopOrRemovalIssued': False,
    'unrelatedServicesModified': False,
    'classification': 'Read-only verification after bounded cleanup; the first post-stop observation and final cleanup summary are distinguished, with both original records retained unchanged.',
}
assert record['exactIdAbsent'] and record['portConnectionRefused']
path = root / 'owned-postgres-cleanup-verification.json'
with path.open('x') as stream:
    json.dump(record, stream, indent=2)
    stream.write('\n')
    stream.flush()
    os.fsync(stream.fileno())
directory = os.open(str(root), os.O_RDONLY)
os.fsync(directory)
os.close(directory)
print(json.dumps(record, indent=2))
