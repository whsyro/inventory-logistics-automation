import { useState } from 'react';
import { Button } from './ui';

/**
 * Small "Export ▾" dropdown offering Excel and PDF. The handlers may be async
 * (the export libraries load lazily); a busy state is shown while they run.
 */
export function ExportMenu({
  onExcel,
  onPdf,
  disabled,
}: {
  onExcel: () => void | Promise<void>;
  onPdf: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => void | Promise<void>) => {
    setOpen(false);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('Export failed', err);
      alert(`Sorry, the export failed: ${(err as Error)?.message ?? 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const itemCls = 'block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50';

  return (
    <div className="relative">
      <Button variant="secondary" disabled={disabled || busy} onClick={() => setOpen((o) => !o)}>
        {busy ? 'Exporting…' : '⭳ Export ▾'}
      </Button>
      {open && (
        <>
          {/* Click-away backdrop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button type="button" className={itemCls} onClick={() => run(onExcel)}>
              Excel (.xlsx)
            </button>
            <button type="button" className={itemCls} onClick={() => run(onPdf)}>
              PDF (.pdf)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
