import { useState } from 'react';
import { apiExport } from '../lib/v2project.js';

export default function ProjectExportButton({ projectId, title, children = 'Export', ...props }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const blob = await apiExport(projectId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'presentation'}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the blob alive until the browser has consumed the download task.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <>
    <button {...props} type="button" disabled={busy} onClick={download}>{busy ? 'Exporting…' : children}</button>
    {error && <span role="alert" className="text-[12px] text-danger">Export failed: {error}</span>}
  </>;
}
