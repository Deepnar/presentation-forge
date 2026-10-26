import datetime
import importlib.util
import json
import os
import pathlib
from unittest.mock import patch

root = pathlib.Path(__file__).resolve().parents[3]
os.chdir(root)
path = root / 'docs/v2-8i-3-evidence/quiet_window.py'
spec = importlib.util.spec_from_file_location('checked_window', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
records = []

def check(name, actual, expected):
    assert actual == expected, (name, actual, expected)
    records.append({'name': name, 'pass': True, 'actual': actual})

pid1 = module.classify_task(1, 1)
own = module.classify_task(os.getpid(), os.getpid())
kernel = module.classify_task(2, 2)
missing = module.classify_task(999999999, 999999999)
check('PID1 is userspace despite an inaccessible executable link', pid1['classification'], 'userspace')
check('the current interpreter is userspace', own['classification'], 'userspace')
check('kthreadd is positively identified by its stat flags', kernel['classification'], 'kernel-thread')
check('a missing thread is unknown', missing['classification'], 'unknown')
with patch.object(pathlib.Path, 'read_text', side_effect=PermissionError()):
    check('permission refusal is unknown', module.classify_task(1, 1)['classification'], 'unknown')
with patch.object(pathlib.Path, 'read_text', return_value='malformed'):
    check('malformed stat is unknown', module.classify_task(1, 1)['classification'], 'unknown')
with patch.object(pathlib.Path, 'read_text', return_value='1 (odd ) ( label) S 1 2 3 4 5 2097152 0'):
    check('parentheses in comm do not move field9', module.classify_task(1, 1)['classification'], 'kernel-thread')
check('known kernel tasks are exempt', module.blocks_admission([kernel]), False)
check('userspace tasks block admission', module.blocks_admission([pid1]), True)
check('unknown tasks block admission', module.blocks_admission([missing]), True)
header = pathlib.Path('/usr/lib/modules') / os.uname().release / 'build/include/linux/sched.h'
definition = next(line for line in header.read_text().splitlines() if line.startswith('#define PF_KTHREAD'))
assert '0x00200000' in definition
result = {
    'implementationSha': module.SHA, 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'helperSha256': module.CLASSIFIER_HASH, 'checks': records, 'pass': len(records), 'fail': 0,
    'kind': 'Read-only validation-metadata oracle checks; not primary product leaf cases.',
    'kernelHeader': str(header), 'definition': definition,
    'runtime': {'pid1': pid1, 'interpreter': own, 'kthreadd': kernel},
    'historicalFstrimFlagsReconstructed': False,
}
pathlib.Path(__file__).with_name('checks.json').write_text(json.dumps(result, indent=2) + '\n')
print('10/10 classifier metadata checks passed; no product tests or generators executed')
