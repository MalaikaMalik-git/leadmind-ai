'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — CsvDropzone
//  Day 12 · Session 2
//
//  A drag-and-drop + click-to-browse file picker, restricted to .csv.
//  Purely a UI/UX layer — the actual file-type enforcement that matters
//  happens server-side in uploadCsv.ts (Day 11). This just gives the admin
//  fast feedback before a network request is even made.
// ─────────────────────────────────────────────

import { useRef, useState } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

interface CsvDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function CsvDropzone({ onFileSelected, disabled }: CsvDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }
    setError(null);
    onFileSelected(file);
  };

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          handleFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '48px 20px',
          borderRadius: 12,
          border: `1.5px dashed ${isDragging ? '#3B82F6' : 'rgba(255,255,255,0.14)'}`,
          background: isDragging ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.015)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 150ms',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(59,130,246,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <UploadCloud size={20} strokeWidth={1.5} color="#3B82F6" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>
            Drag & drop your CSV here
          </p>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
            or click to browse — max 5MB, .csv only
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <p style={{ color: '#F87171', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={12} /> {error}
        </p>
      )}
    </div>
  );
}