import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { SalonExportMetric, SalonExportRow } from "./bi";

const COLUMNS = ["Sr No", "Salon Name", "Branch No", "City", "Address"] as const;

function headerRow(metric: SalonExportMetric) {
  return [...COLUMNS, metric];
}

function asMatrix(rows: SalonExportRow[], metric: SalonExportMetric): (string | number)[][] {
  return rows.map((r) => [
    r["Sr No"],
    r["Salon Name"],
    r["Branch No"],
    r.City,
    r.Address,
    (r[metric] as number) ?? 0,
  ]);
}

export function exportSalonExcel(rows: SalonExportRow[], metric: SalonExportMetric, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headerRow(metric) as string[] });
  ws["!cols"] = [{ wch: 6 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 32 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Salon ${metric}`);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function exportSalonCsv(rows: SalonExportRow[], metric: SalonExportMetric, filename: string) {
  const header = headerRow(metric);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = asMatrix(rows, metric).map((r) => r.map(escape).join(","));
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportSalonPdf(
  rows: SalonExportRow[],
  metric: SalonExportMetric,
  filename: string,
  title: string
) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Salon ${metric} report · ${new Date().toLocaleDateString("en-IN")}`, 14, 22);
  autoTable(doc, {
    startY: 28,
    head: [headerRow(metric) as string[]],
    body: asMatrix(rows, metric).map((r) =>
      r.map((c, i) => (i === 5 ? "INR " + Number(c).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : String(c)))
    ),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [91, 75, 138] },
    columnStyles: { 0: { cellWidth: 14 }, 5: { halign: "right" } },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
