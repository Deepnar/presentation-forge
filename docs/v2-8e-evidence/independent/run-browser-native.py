import json
import run as runner
runner.records=json.loads((runner.ROOT/'execution.json').read_text())
assert not any(r['name']=='browser-native' for r in runner.records), 'Do not overwrite captured native evidence'
runner.run('browser-native',['node',str(runner.ROOT/'browser-native.mjs')])
