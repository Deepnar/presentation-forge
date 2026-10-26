import datetime
import hashlib
import json
import os
import pathlib
import platform
import re
import subprocess

root = pathlib.Path('docs/v2-8i-4-evidence')
out = pathlib.Path(os.environ['FORGE_VALIDATION_OUT'])
sha = json.loads((root / 'validation-plan.json').read_text())['implementationSha']
complete = json.loads((out / 'coordinator-complete.json').read_text())
assert complete['implementationSha'] == sha and complete['orderedExecutionComplete']
source = out / 'resource-window.jsonl'
rows = [json.loads(line) for line in source.read_text().splitlines() if line]
assert rows and all(row['implementationSha'] == sha for row in rows)


def bounds(values):
    return {'minimum': min(values), 'maximum': max(values)}


def summarize(selected):
    assert selected
    duration = sum(row['sampleSeconds'] for row in selected)
    devices = sorted({name for row in selected for name in row['disks']})
    return {
        'samples': len(selected),
        'sampleSeconds': duration,
        'cpuBusyPercent': bounds([row['cpuBusyPercent'] for row in selected]),
        'cpuBusyDurationWeightedMeanPercent': sum(
            row['cpuBusyPercent'] * row['sampleSeconds'] for row in selected
        ) / duration,
        'cpuIoWaitPercent': bounds([row['cpuIoWaitPercent'] for row in selected]),
        'availableGiB': bounds([row['availableKiB'] / 1024**2 for row in selected]),
        'pressureSomeAvg10': {
            name: bounds([
                float(re.search(r'^some avg10=([\d.]+)', row['pressure'][name]).group(1))
                for row in selected
            ]) for name in ['cpu', 'memory', 'io']
        },
        'devices': {
            name: {
                key: bounds([row['disks'][name][key] for row in selected if name in row['disks']])
                for key in ['busyPercent', 'weightedQueue', 'inflight']
            } for name in devices
        },
        'criticalSamples': sum(bool(row['critical']) for row in selected),
        'samplesWithUserspaceBlockedThreads': sum(
            any(thread['userspace'] for thread in row['blockedThreads']) for row in selected
        ),
        'samplesWithUnknownBlockedThreads': sum(
            any(thread.get('classification') == 'unknown' for thread in row['blockedThreads']) for row in selected
        ),
        'legacyClassifierSamples': sum(row.get('blockedClassifierVersion', 1) == 1 for row in selected),
    }


phases = sorted({row['phase'] for row in rows})
qualification = json.loads((out / 'sustained-window.json').read_text())
assert qualification['implementationSha'] == sha
runs = json.loads((out / 'coordinator.json').read_text())
admissions = []
for run in runs:
    assert run['implementationSha'] == sha
    started = datetime.datetime.fromisoformat(run['atUtc'])
    preceding = [
        row for row in rows if datetime.datetime.fromisoformat(row['atUtc']) <= started
    ][-2:]
    assert len(preceding) == 2 and all(
        row['phase'] == 'pre-job' and row['ready'] for row in preceding
    ), run['name']
    seconds = sum(row['sampleSeconds'] for row in preceding)
    age = (started - datetime.datetime.fromisoformat(preceding[-1]['atUtc'])).total_seconds()
    assert seconds >= 30 and 0 <= age < 1, (run['name'], seconds, age)
    admissions.append({
        'job': run['name'], 'startedAtUtc': run['atUtc'],
        'precedingReadyAtUtc': [row['atUtc'] for row in preceding],
        'readySampleSeconds': seconds, 'lastSampleAgeSeconds': age,
        'blockedClassifierVersions': [row.get('blockedClassifierVersion', 1) for row in preceding],
    })
report = {
    'implementationSha': sha,
    'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'resourceSamples': str(root / 'resource-window.jsonl'),
    'resourceSamplesSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'qualification': qualification,
    'allRecordedJobAdmissionsVerified': True,
    'jobAdmissions': admissions,
    'environment': {
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'platform': platform.platform(),
        'logicalCpuCount': os.cpu_count(),
        'backend': 'Owned isolated PostgreSQL15.18 at127.0.0.1:5544; temporary SQLite stores',
    },
    'allSamples': summarize(rows),
    'phases': {
        phase: summarize([row for row in rows if row['phase'] == phase]) for phase in phases
    },
    'admission': {
        'freshConsecutiveSamples': 2,
        'minimumSeconds': 30,
        'cpuBusyPercentBelow': 25,
        'cpuIoWaitPercentBelow': 20,
        'cpuSomeAvg10Below': 10,
        'memorySomeAvg10Below': 1,
        'availableGiBAbove': 8,
        'storageBusyPercentBelow': 5,
        'storageWeightedQueueBelow': 0.5,
        'storageInflightAtMost': 1,
        'userspaceBlockedThreads': 0,
        'unknownBlockedThreads': 0,
        'currentBlockedClassifier': 'Per-thread stat PF_KTHREAD; only positively identified kernel tasks are exempt. Unknown metadata blocks admission.',
    },
    'isolation': {
        'bulkFileConcurrency': 1,
        'browserBuildConcurrency': 1,
        'nice': 10,
        'ionice': {'class': 2, 'priority': 7},
        'watchdogMinutes': {'bulk': 30, 'other': 15},
        'criticalStopAfterConsecutiveSamples': 3,
    },
    'limitations': [
        'Global I/O PSI and iowait have unresolved provenance; no attribution to another workload.',
        'Legacy exe.exists classifications remain as recorded and can misclassify inaccessible userspace tasks. Original flags were not retained; no historical classification is reconstructed. Corrected version2 samples bind the helper hash and explicit classification.',
        'Running samples are periodic observations, not continuous peak or per-process profiling.',
        'Short jobs can complete between running samples; admission samples remain available.',
        'Local fixture/backend timing is not live-provider latency or a production percentile.',
        'Supervisor interruptions between jobs are recorded separately and do not cancel leaf tests.',
    ],
}
(root / 'resource-assessment.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'samples': len(rows), 'phases': len(phases), 'output': str(root / 'resource-assessment.json')}))
