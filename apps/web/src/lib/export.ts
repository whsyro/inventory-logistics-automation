// Client-side export helpers. The heavy libraries (exceljs, jspdf) are loaded
// lazily inside each function so they stay out of the main bundle and only load
// when the user actually exports. Exports reflect exactly the data passed in —
// i.e. what's currently on screen (already filtered/scoped by the API).

export interface ExportColumn<T> {
  header: string;
  /** Raw cell value — numbers stay numeric in Excel so totals can be summed. */
  value: (row: T) => string | number | null | undefined;
  /** Optional display string (used by PDF, and Excel when no numeric value). */
  display?: (row: T) => string;
  /** Excel column width (characters). */
  width?: number;
  /** Excel number format, e.g. '$#,##0.00'. */
  numFmt?: string;
  align?: 'left' | 'right';
}

export interface ExportTable<T> {
  /** Excel sheet name / PDF section heading. */
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

function cellText<T>(col: ExportColumn<T>, row: T): string {
  if (col.display) return col.display(row);
  const v = col.value(row);
  return v === null || v === undefined ? '' : String(v);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Excel forbids \ / ? * [ ] : in sheet names and caps them at 31 chars. */
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
}

/** Build a `.xlsx` workbook (one worksheet per table) and download it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportExcel(filename: string, tables: ExportTable<any>[]) {
  // exceljs ships a UMD browser build; default may or may not be present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('exceljs')) as any;
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  for (const table of tables) {
    const ws = wb.addWorksheet(safeSheetName(table.name));
    ws.columns = table.columns.map((c) => ({
      header: c.header,
      key: c.header,
      width: c.width ?? Math.max(12, c.header.length + 2),
    }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

    for (const row of table.rows) {
      const added = ws.addRow(
        table.columns.map((c) => {
          const v = c.value(row);
          return v === undefined ? null : v;
        }),
      );
      table.columns.forEach((c, idx) => {
        const cell = added.getCell(idx + 1);
        if (c.numFmt) cell.numFmt = c.numFmt;
        if (c.align) cell.alignment = { horizontal: c.align };
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${filename}.xlsx`,
  );
}

export interface PdfExport {
  filename: string;
  title: string;
  /** Lines printed under the title (filters, totals, generated-at, etc.). */
  meta?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tables: ExportTable<any>[];
}

/** Build a landscape PDF (title + meta + one auto-table per section) and download it. */
export async function exportPdf({ filename, title, meta, tables }: PdfExport) {
  const { jsPDF } = await import('jspdf');
  // jspdf-autotable's default export shape varies across bundler interop, so apply
  // the plugin to the constructor and call doc.autoTable — the robust path.
  const autotableMod = (await import('jspdf-autotable')) as unknown as {
    applyPlugin?: (ctor: unknown) => void;
    default?: { applyPlugin?: (ctor: unknown) => void };
  };
  (autotableMod.applyPlugin ?? autotableMod.default?.applyPlugin)?.(jsPDF);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }) as InstanceType<
    typeof jsPDF
  > & {
    autoTable: (options: Record<string, unknown>) => void;
    lastAutoTable: { finalY: number };
  };
  const marginX = 40;
  let y = 48;

  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(title, marginX, y);
  y += 18;

  if (meta?.length) {
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    for (const line of meta) {
      doc.text(line, marginX, y);
      y += 12;
    }
  }
  y += 6;

  for (const table of tables) {
    if (table.name && tables.length > 1) {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(table.name, marginX, y);
      y += 4;
    }
    doc.autoTable({
      startY: y,
      head: [table.columns.map((c) => c.header)],
      body: table.rows.map((row) => table.columns.map((c) => cellText(c, row))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      columnStyles: Object.fromEntries(
        table.columns.map((c, idx) => [idx, { halign: c.align ?? 'left' }]),
      ),
      margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 22;
  }

  doc.save(`${filename}.pdf`);
}
