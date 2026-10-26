import datetime
import hashlib
import io
import json
import pathlib
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
E = pathlib.Path(__file__).resolve().parent
P = ROOT / 'docs/v2-8i-3-evidence'
SHA = '2ba82cb5c321c21d5648f577469f69e82cdcfb24'

def read(path):
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (E / name).write_text(json.dumps(value, indent=2) + '\n')

manifest = read(P / 'source-manifest.json')
source = []
for row in manifest['changedSourceFiles']:
    path = ROOT / row['path']
    assert digest(path) == row['sha256']
    assert path.read_bytes() == subprocess.check_output(['git', 'show', SHA + ':' + row['path']])
    source.append(row)
changed = subprocess.check_output(['git', 'diff', '--name-only', manifest['acceptedBaseline'], SHA, '--', *manifest['sourcePathsCompared']], text=True).splitlines()
assert set(changed) == {row['path'] for row in source}
for row in manifest['helperFiles']:
    assert digest(ROOT / row['path']) == row['sha256']
save('source-equality.json', {'implementationSha': SHA, 'reviewedPacketSha': '8666ab0fcf295ffdf850f758771ad465e74a592f', 'sourceFiles': source, 'exactChangedPathSet': True, 'allHelperHashesMatch': True, 'helperFiles': manifest['helperFiles']})

plan = read(P / 'validation-plan.json')
runs = read(P / 'logs/coordinator.json')
byname = {row['name']: row for row in runs}
groups = {}
primary = []
for group in ['bulk', 'serial', 'postgres']:
    names = ['bulk'] if group == 'bulk' else [pathlib.Path(f).stem for f in plan[group]]
    totals = dict.fromkeys(['total', 'pass', 'fail', 'skip', 'cancelled'], 0)
    for name in names:
        row = byname[name]
        assert row['implementationSha'] == SHA and row['exitCode'] == 0
        path = P / ('logs/non-browser-bulk.tap' if name == 'bulk' else 'logs/files/' + name + '.tap')
        text = path.read_text()
        marked = re.findall(r'^# forge-test-file "([^"]+)"$', text, re.M)
        assert len(marked) == len(row['files']) and set(marked) == set(row['files'])
        for key, label in {'total': 'tests', 'pass': 'pass', 'fail': 'fail', 'skip': 'skipped', 'cancelled': 'cancelled'}.items():
            value = int(re.findall(r'^# ' + label + r' (\d+)\s*$', text, re.M)[-1])
            assert value == row['tests'][key]
            totals[key] += value
        primary.extend(row['files'])
    assert totals['fail'] == totals['skip'] == totals['cancelled'] == 0
    groups[group] = {'files': len(plan[group]), 'tests': totals}
assert len(primary) == len(set(primary)) == 234
assert set(primary) == set(sum([plan[g] for g in ['bulk', 'serial', 'postgres']], []))
assert sum(row['tests']['pass'] for row in groups.values()) == 3048
save('packet-reconciliation.json', {'implementationSha': SHA, 'orderedJobs': len(runs), 'primaryGroups': groups, 'primaryFiles': 234, 'primaryPasses': 3048, 'focusedOverlapping': byname['conversation-http-gate']['tests'], 'supplementalNativeCases': 4, 'standingLocaleSeparate': byname['byok-locale']['tests'], 'rootLogsInspected': True, 'independentExecution': False})

images = read(P / 'images.json')
assert len(images) == 119
for row in images:
    assert row['implementationSha'] == SHA and digest(ROOT / row['file']) == row['sha256']
full = [1, 21, 22, 37, 46, 48, 64, 69, 72, 74, 81, 105, 106, 109, 111, 118, 119]
save('visual-inspection.json', {'implementationSha': SHA, 'packetImagesHashVerifiedAndContactInspected': len(images), 'contactSheetsViewed': list(range(1, 21)), 'browserImages': 76, 'nativeSvgExportImages': 43, 'fullSizeViewed': [dict(index=i, **images[i-1]) for i in full], 'findings': ['No new material dialog clipping, overlapping action or unexplained canvas shift observed.', 'Inherited narrow partial canvas/toolbar overflow and left-edge sidebar overlap remain visible.', 'The font-recovery capture retains its scrolled heading; loading/transition captures do not prove settled previews.', 'Native italic second run and chart/table values 2.5/15.75 are preserved; SVG first-run styling and chart-consumer differences remain.', 'No independent browser or interactive Microsoft PowerPoint session ran.'], 'newInteractiveBehaviorQualification': False})

archives = []
for origin, base in [('packet', P), ('fresh-independent', E)]:
    native = read(base / 'native-archives.json')
    for row in native:
        archives.append({'origin': origin, 'file': row['pptx'], 'sha256': row['sha256']})
    if origin == 'packet':
        for metadata in ['browser-archives.json', 'http-archives.json']:
            archives.extend(dict(origin=origin, file=row['originalArchive'], sha256=row['sha256']) for row in read(base / metadata))
    else:
        for file in sorted((E / 'http-archives').glob('*.pptx')):
            archives.append({'origin': origin, 'file': str(file.relative_to(ROOT)), 'sha256': digest(file)})
assert len(archives) == 25
for row in archives:
    path = ROOT / row['file']
    assert digest(path) == row['sha256']
    parts = []
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        for name in archive.namelist():
            if not name.endswith('.xml'):
                continue
            xml = ET.fromstring(archive.read(name))
            nodes = list(xml.iter('{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr'))
            if not nodes:
                continue
            ids = [int(node.attrib['id']) for node in nodes]
            assert all(0 <= value <= 4294967295 for value in ids) and len(ids) == len(set(ids))
            parts.append({'part': name, 'nonvisualProperties': len(ids)})
    assert any(re.fullmatch(r'ppt/slides/slide\d+\.xml', part['part']) for part in parts)
    row['parts'] = parts
save('native-inspection.json', {'implementationSha': SHA, 'archives': len(archives), 'packetArchives': 15, 'freshIndependentOriginalArchives': 10, 'parts': sum(len(row['parts']) for row in archives), 'nonvisualProperties': sum(part['nonvisualProperties'] for row in archives for part in row['parts']), 'zipCrcAndNamespaceAwareXmlChecked': True, 'uniquePerPartIds': True, 'originalArchivesReconstructed': False, 'interactiveMicrosoftPowerPoint': False, 'records': archives})

comparisons = []
for own in [row for row in archives if row['origin'] == 'fresh-independent']:
    packet = P / pathlib.Path(own['file']).relative_to(E.relative_to(ROOT))
    if 'http-archives' in own['file']:
        backend = 'postgres' if pathlib.Path(own['file']).name.startswith('postgresql') else 'sqlite'
        packet = P / 'http-archives' / (backend + '-approved.pptx')
    differences = []
    with zipfile.ZipFile(ROOT / own['file']) as fresh, zipfile.ZipFile(packet) as prior:
        assert set(fresh.namelist()) == set(prior.namelist())
        for name in fresh.namelist():
            if fresh.read(name) == prior.read(name):
                continue
            differences.append(name)
            normalize = lambda data: re.sub(rb'<dcterms:(created|modified)\b[^>]*>[^<]*</dcterms:\1>', b'<timestamp/>', data)
            if name == 'docProps/core.xml':
                assert normalize(fresh.read(name)) == normalize(prior.read(name))
            else:
                assert name.endswith('.xlsx')
                with zipfile.ZipFile(io.BytesIO(fresh.read(name))) as left, zipfile.ZipFile(io.BytesIO(prior.read(name))) as right:
                    assert left.testzip() is None and right.testzip() is None
                    assert set(left.namelist()) == set(right.namelist())
                    for part in left.namelist():
                        if left.read(part) != right.read(part):
                            assert part == 'docProps/core.xml' and normalize(left.read(part)) == normalize(right.read(part))
    comparisons.append({'freshOriginal': own['file'], 'packetOriginal': str(packet.relative_to(ROOT)), 'differentPayloadParts': differences, 'allPayloadsEqualExceptCreationModificationTimesAndZipMetadata': True})
save('fresh-archive-comparison.json', {'implementationSha': SHA, 'comparisons': comparisons, 'note': 'Exact fresh originals retained; ZIP metadata and creation/modification timestamps may differ. No archive reconstruction.'})

native_images = read(E / 'native-images.json')
for row in native_images:
    packet = P / pathlib.Path(row['file']).relative_to(E.relative_to(ROOT))
    assert digest(ROOT / row['file']) == row['sha256'] == digest(packet)
save('fresh-raster-comparison.json', {'implementationSha': SHA, 'freshNativeSvgImagesExecuted': len(native_images), 'allHashEqualToInspectedPacketImages': True, 'images': native_images})

preservation = []
for label, path in [('root-historical', P / 'backup-manifest.json'), ('root-canonical', ROOT / 'out/v2-8i-3-validation/prior-generated-backup/index.json'), ('independent-all-current', E / 'backup-manifest.json'), ('independent-canonical', E / 'canonical-manifest.json')]:
    index = read(path)
    assert all(digest(ROOT / row['path']) == row['sha256'] for row in index)
    preservation.append({'scope': label, 'manifest': str(path.relative_to(ROOT)), 'manifestSha256': digest(path), 'files': len(index), 'pptx': sum(row['path'].endswith('.pptx') for row in index), 'allCurrentHashesMatch': True})
save('preservation-checkpoint.json', {'implementationSha': SHA, 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'records': preservation, 'archiveReconstruction': False})
print('Source, primary accounting, 119 images, 25 archives, exact fresh raster/payload comparison and all prior originals verified.')
