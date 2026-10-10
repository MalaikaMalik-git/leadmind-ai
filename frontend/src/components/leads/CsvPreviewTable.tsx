'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — CsvPreviewTable
//  Day 12 · Session 2
//
//  Shows the admin exactly what we detected before they commit:
//   • Column mapping badges — which CSV header maps to which Lead field
//   • First 5 parsed rows, so obviously-wrong files get caught early
//   • Total row count
// ─────────────────────────────────────────────

import { DetectedColumn } from '@/src/lib/utils/csvColumnMapping';

interface CsvPreviewTableProps {
  headers: string[];
  columnMapping: DetectedColumn[];
  previewRows: Record<string, string>[]; // already sliced to first 5 by the caller
  totalRows: number;
}

export default function CsvPreviewTable({
  headers,
  columnMapping,
  previewRows,
  totalRows,
}: CsvPreviewTableProps) {
  const mappingByHeader = new Map(columnMapping.map((c) => [c.originalHeader, c]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Column mapping badges ────────────── */}
      <div>
        <p style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Detected Columns
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {headers.map((header) => {
            const mapping = mappingByHeader.get(header);
            const isMapped = !!mapping?.canonicalField;
            return (
              <div
                key={header}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 7,
                  background: isMapped ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isMapped ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  fontSize: 11,
                }}
              >
                <span style={{ color: '#64748B' }}>{header}</span>
                {isMapped && (
                  <>
                    <span style={{ color: '#334155' }}>→</span>
                    <span style={{ color: '#60A5FA', fontWeight: 600 }}>{mapping!.canonicalLabel}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Preview table ─────────────────────── */}
      <div>
        <p style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Preview — first {previewRows.length} of {totalRows} row{totalRows === 1 ? '' : 's'}
        </p>
        <div style={{
          borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
          overflow: 'auto', maxWidth: '100%',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {headers.map((header) => (
                  <th
                    key={header}
                    style={{
                      textAlign: 'left', padding: '8px 12px',
                      color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: i === previewRows.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                  {headers.map((header) => (
                    <td key={header} style={{ padding: '8px 12px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>
                      {row[header] || <span style={{ color: '#334155' }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}