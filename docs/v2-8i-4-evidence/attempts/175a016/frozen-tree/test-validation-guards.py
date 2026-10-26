import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('guards', pathlib.Path(__file__).with_name('validation_guards.py'))
guards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guards)
PREPARATION = pathlib.Path(__file__).resolve().with_name('prepare-full-validation.py').read_text()


class SnapshotGuards(unittest.TestCase):
    def setUp(self):
        self.old = pathlib.Path.cwd()
        self.temp = tempfile.TemporaryDirectory()
        os.chdir(self.temp.name)
        self.root = pathlib.Path('docs/v2-8i-4-evidence')
        self.root.mkdir(parents=True)
        self.out = pathlib.Path('out/validation')
        self.historical = [self.row('docs/v2-prior-evidence/original.pptx', 'backup')]
        self.canonical = [self.row(name, 'prior-generated-backup') for name in guards.CANONICAL_ORIGINALS]
        self.write_indexes()

    def tearDown(self):
        os.chdir(self.old)
        self.temp.cleanup()

    def row(self, name, folder):
        original = pathlib.Path(name)
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_bytes(b'original-archive-bytes')
        backup = self.out/folder/name
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(original.read_bytes())
        return {'path': name, 'bytes': original.stat().st_size, 'sha256': guards.digest(original)}

    def write_indexes(self):
        for file, data in [(self.out/'backup/index.json', self.historical),
                           (self.out/'prior-generated-backup/index.json', self.canonical),
                           (self.root/'backup-manifest.json', self.historical)]:
            file.write_text(json.dumps(data))
        proof = {'implementationSha': 'source', 'complete': True,
                 'historicalFiles': len(self.historical), 'canonicalFiles': len(self.canonical),
                 'historicalIndexSha256': guards.digest(self.out/'backup/index.json'),
                 'canonicalIndexSha256': guards.digest(self.out/'prior-generated-backup/index.json')}
        (self.out/'snapshot-complete.json').write_text(json.dumps(proof))

    def check(self, resume=False):
        return guards.validate_snapshots(self.root, self.out, 'source', resume)

    def test_complete_initial_and_resume_snapshots(self):
        self.assertTrue(self.check()['currentOriginalsVerified'])
        pathlib.Path(self.historical[0]['path']).write_bytes(b'fresh test output')
        self.assertFalse(self.check(True)['currentOriginalsVerified'])
        with self.assertRaises(AssertionError): self.check()

    def test_incomplete_preparation_has_no_admission(self):
        (self.out/'snapshot-complete.json').unlink()
        with self.assertRaises(FileNotFoundError): self.check()

    def test_missing_backup_is_refused_on_resume(self):
        (self.out/'backup'/self.historical[0]['path']).unlink()
        with self.assertRaises(FileNotFoundError): self.check(True)

    def test_changed_backup_is_refused_on_resume(self):
        (self.out/'prior-generated-backup'/self.canonical[0]['path']).write_bytes(b'corrupt')
        with self.assertRaises(AssertionError): self.check(True)

    def test_missing_historical_original_is_not_hidden_by_updated_index(self):
        self.row('docs/v2-prior-evidence/omitted.pptx', 'backup')
        with self.assertRaises(AssertionError): self.check()

    def test_missing_canonical_original_is_refused(self):
        self.canonical.pop()
        self.write_indexes()
        with self.assertRaises(AssertionError): self.check()

    def test_wrong_source_is_refused(self):
        with self.assertRaises(AssertionError):
            guards.validate_snapshots(self.root, self.out, 'different-source', True)

    def test_duplicate_history_is_refused_even_with_matching_index_proof(self):
        self.historical.append(copy.deepcopy(self.historical[0]))
        self.write_indexes()
        with self.assertRaises(AssertionError): self.check(True)

    def test_actual_preparation_snapshot_block_writes_a_verifiable_proof(self):
        shutil.rmtree(self.out)
        self.out.mkdir(parents=True)
        (self.root/'backup-manifest.json').unlink()
        block = PREPARATION[PREPARATION.index('index = []'):PREPARATION.index("print('Snapshot verified'")]
        environment = {'root': self.root, 'out': self.out, 'sha': 'source',
                       'digest': guards.digest, 'file_digest': guards.digest,
                       'validate_snapshots': guards.validate_snapshots,
                       'pathlib': pathlib, 'hashlib': hashlib, 'json': json, 'shutil': shutil, 'os': os}
        exec(compile(block, 'actual-preparation-snapshot-block', 'exec'), environment)
        self.assertTrue(self.check()['allBackupHashesMatch'])


if __name__ == '__main__':
    unittest.main()
