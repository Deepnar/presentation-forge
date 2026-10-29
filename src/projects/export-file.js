import { mkdtemp, open, lstat, link, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';

const failure = code => Object.assign(new Error(code === 'output-exists' ? 'The output path already exists.' :
  code === 'publication-unknown' ? 'Publication acknowledgement failed; the output may be complete. Inspect it before retrying.' :
  'Private exclusive file publication is unavailable.'),{code});
// Complete bytes are made visible with one exclusive same-filesystem operation.
export async function publishPrivateExport(filename,bytes) {
  if(process.platform === 'win32' || typeof process.getuid !== 'function' || !(bytes instanceof Uint8Array))throw failure('publication-unsupported');
  const target=path.resolve(filename),parent=path.dirname(target);let dir,file,handle,published=false;
  try {
    dir=await mkdtemp(path.join(parent,'.forge-export-'));
    // mkdtemp requests0700; refuse filesystems that did not preserve privacy.
    const directory=await lstat(dir);
    if(!directory.isDirectory() || directory.uid !== process.getuid() || (directory.mode & 0o777) !== 0o700)throw failure('publication-unsupported');
    file=path.join(dir,'deck.pptx');handle=await open(file,'wx',0o600);
    const stat=await handle.stat();
    if(!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)throw failure('publication-unsupported');
    await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;
    await link(file,target);published=true;
    // A failed durability acknowledgement must not delete a complete final file.
    const directoryHandle=await open(parent,'r');
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    return {path:target,bytes:bytes.length};
  } catch(error) {
    throw failure(published ? 'publication-unknown' : error?.code === 'EEXIST' ? 'output-exists' : 'publication-unsupported');
  } finally {
    await handle?.close().catch(()=>{});
    if(file)await unlink(file).catch(()=>{});
    if(dir)await rmdir(dir).catch(()=>{});
  }
}
