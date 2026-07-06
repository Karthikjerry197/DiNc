import type { GuidebookDetail } from './api';
import { humanizeSectionKey } from '@/components/guidebooks/GuidebookTabs';

// DiNC brand palette (mirrors globals.css: --p, --tp, --ts).
const BRAND: [number, number, number] = [36, 161, 72];
const TEXT: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [107, 114, 128];

const PAGE_W = 210; // A4 portrait, mm
const PAGE_H = 297;
const MARGIN_X = 18;
const TOP_Y = 20;
const BOTTOM_Y = PAGE_H - 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BULLET_INDENT = 5;

/**
 * Generates and downloads a PDF of one guidebook: title, category, version,
 * updated date, then every section in display order — headings preserved,
 * array sections as bullet lists, text sections as paragraphs. Simple DiNC
 * branding and "Page x of y" on every page. jspdf is imported on demand so it
 * never enters the main bundle.
 */
export async function downloadGuidebookPdf(detail: GuidebookDetail): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = TOP_Y;

  const ensureSpace = (needed: number) => {
    if (y + needed > BOTTOM_Y) {
      doc.addPage();
      y = TOP_Y;
    }
  };

  // ── Document header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text('DiNC · Digital Integrated Care Network', MARGIN_X, y);
  y += 8;

  doc.setFontSize(16);
  doc.setTextColor(...TEXT);
  const titleLines = doc.splitTextToSize(detail.title, CONTENT_W) as string[];
  doc.text(titleLines, MARGIN_X, y);
  y += titleLines.length * 7 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const updated = new Date(detail.updatedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  doc.text(
    [
      detail.code,
      detail.category,
      `Version ${detail.version ?? '—'}`,
      `Updated ${updated}`,
    ].join('  ·  '),
    MARGIN_X,
    y,
  );
  y += 3;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 8;

  // ── Sections, in display order ──
  for (const [key, value] of Object.entries(detail.sections)) {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...BRAND);
    doc.text(humanizeSectionKey(key), MARGIN_X, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT);

    if (Array.isArray(value)) {
      for (const item of value) {
        const lines = doc.splitTextToSize(item, CONTENT_W - BULLET_INDENT) as string[];
        ensureSpace(lines.length * 5 + 2);
        doc.text('•', MARGIN_X, y);
        doc.text(lines, MARGIN_X + BULLET_INDENT, y);
        y += lines.length * 5 + 1.5;
      }
    } else {
      const lines = doc.splitTextToSize(value, CONTENT_W) as string[];
      ensureSpace(lines.length * 5);
      doc.text(lines, MARGIN_X, y);
      y += lines.length * 5;
    }
    y += 6;
  }

  // ── Footer: branding + page numbers on every page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('DiNC · Clinical Protocol', MARGIN_X, PAGE_H - 10);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN_X, PAGE_H - 10, { align: 'right' });
  }

  doc.save(`${detail.code}_guidebook_v${detail.version ?? 1}.pdf`);
}
