import hashlib
import json
import pathlib
import subprocess

SOURCE_PATHS = ['app', 'packages', 'src', 'test', 'tools', 'schema', 'themes',
                'package.json', 'package-lock.json', 'tsconfig.json',
                'docs/development-state.schema.json']
CANONICAL_ORIGINALS = [
    'out/v2-7a-validation/shell-chart.pptx', 'out/v2-7a-validation/shell-table.pptx',
    'out/v2-7b-1-validation/browser/imported-chart.pptx',
    'out/v2-7b-1-validation/browser/imported-table.pptx',
    'out/v2-7b-2-validation/browser/handoff.pptx',
]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def validate_source(root, plan):
    sha = plan['implementationSha']
    source = json.loads((root/'source-manifest.json').read_text())
    assert source['implementationSha'] == sha
    assert source['acceptedBaseline'] == plan['acceptedBaseline']
    assert source['taskEntry'] == plan['taskEntry']
    assert source['sourcePathsCompared'] == SOURCE_PATHS and source['workingSourceDelta'] == []
    subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD'], check=True)
    subprocess.run(['git', 'diff', '--quiet', sha, '--', *SOURCE_PATHS], check=True)
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', *SOURCE_PATHS], text=True).splitlines()
    assert not untracked, ('Untracked implementation files invalidate the frozen source', untracked)
    changed = subprocess.check_output(['git', 'diff', '--name-only', source['acceptedBaseline'], sha, '--', *SOURCE_PATHS], text=True).splitlines()
    assert changed == [row['path'] for row in source['changedSourceFiles']]
    for row in source['changedSourceFiles']:
        assert digest(pathlib.Path(row['path'])) == row['sha256']
        assert subprocess.check_output(['git', 'rev-parse', sha+':'+row['path']], text=True).strip() == row['implementationBlob']
    helpers = json.loads((root/'helper-source-manifest.json').read_text())
    assert helpers['implementationSha'] == sha
    expected = {str(p) for p in root.iterdir() if p.suffix in ['.py', '.mjs']} | {str(root/'validation-plan.json')}
    assert len(helpers['files']) == len(expected) and {row['path'] for row in helpers['files']} == expected
    for row in helpers['files']:
        assert digest(pathlib.Path(row['path'])) == row['sha256'], ('Validation helper drift', row['path'])


def validate_snapshots(root, out, sha, resume):
    historical = json.loads((out/'backup/index.json').read_text())
    canonical = json.loads((out/'prior-generated-backup/index.json').read_text())
    proof = json.loads((out/'snapshot-complete.json').read_text())
    assert proof['implementationSha'] == sha and proof['complete']
    assert proof['historicalFiles'] == len(historical) > 0
    assert proof['canonicalFiles'] == len(canonical) == len(CANONICAL_ORIGINALS)
    assert proof['historicalIndexSha256'] == digest(out/'backup/index.json')
    assert proof['canonicalIndexSha256'] == digest(out/'prior-generated-backup/index.json')
    assert json.loads((root/'backup-manifest.json').read_text()) == historical
    historical_paths = [row['path'] for row in historical]
    assert len(historical_paths) == len(set(historical_paths))
    for name in historical_paths:
        source = pathlib.Path(name)
        assert source.parts[0] == 'docs' and source.parts[1].startswith('v2-') and source.parts[1].endswith('-evidence')
        assert not source.is_relative_to(root) and '..' not in source.parts
    assert len(canonical) == len({row['path'] for row in canonical})
    assert {row['path'] for row in canonical} == set(CANONICAL_ORIGINALS)
    for folder, rows in [('backup', historical), ('prior-generated-backup', canonical)]:
        for row in rows:
            backup = out/folder/row['path']
            assert backup.stat().st_size == row['bytes'] and digest(backup) == row['sha256'], ('Snapshot integrity', str(backup))
            if not resume:
                original = pathlib.Path(row['path'])
                assert original.stat().st_size == row['bytes'] and digest(original) == row['sha256'], ('Original changed before first job', row['path'])
    if not resume:
        current = {str(p) for folder in pathlib.Path('docs').glob('v2-*-evidence') if folder != root for p in folder.rglob('*') if p.is_file()}
        assert current == set(historical_paths), ('Historical snapshot completeness', current ^ set(historical_paths))
    return {'implementationSha': sha, 'historicalFiles': len(historical), 'canonicalFiles': len(canonical),
            'allBackupHashesMatch': True, 'currentOriginalsVerified': not resume, 'resume': resume}
