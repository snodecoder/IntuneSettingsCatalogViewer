'use client';

import { useState, useCallback, useRef } from 'react';
import { basePath } from '@/lib/basePath';
import type { OmaUriIndexEntry } from '@/lib/types';
import { parseOmaUriInput, convertOmaUriRows, type ConversionResult } from '@/lib/oma-uri-converter';

const SAMPLE_INPUT = `[
  {
    "name": "Ads setting for sites with intrusive ads",
    "omaUri": "./Device/Vendor/MSFT/Policy/Config/Edge/AdsSettingForIntrusiveAdsSites",
    "value": 1
  }
]`;

const statusStyles: Record<string, string> = {
  converted: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200',
  unmatched: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  unsupported: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200',
  'invalid-value': 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  converted: 'Converted',
  unmatched: 'Not found',
  unsupported: 'Unsupported',
  'invalid-value': 'Invalid value',
};

export default function OmaUriConverter() {
  const [rawText, setRawText] = useState('');
  const [policyName, setPolicyName] = useState('Converted Settings Catalog Policy');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<Record<string, OmaUriIndexEntry> | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const loadIndex = useCallback(async () => {
    if (indexRef.current) return indexRef.current;
    const res = await fetch(`${basePath}/oma-uri-index.json`);
    if (!res.ok) throw new Error(`Failed to load conversion index: ${res.status}`);
    const data = (await res.json()) as Record<string, OmaUriIndexEntry>;
    indexRef.current = data;
    return data;
  }, []);

  const handleConvert = useCallback(async () => {
    setError(null);
    setResult(null);
    if (!rawText.trim()) {
      setError('Paste or upload an OMA-URI JSON policy first.');
      return;
    }
    setIsConverting(true);
    try {
      const rows = parseOmaUriInput(rawText);
      const index = await loadIndex();
      setResult(convertOmaUriRows(rows, index, policyName || 'Converted Settings Catalog Policy'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConverting(false);
    }
  }, [rawText, policyName, loadIndex]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result || ''));
    reader.readAsText(file);
  }, []);

  const outputJson = result ? JSON.stringify(result.policy, null, 2) : '';

  const handleCopy = useCallback(() => {
    if (!outputJson) return;
    navigator.clipboard.writeText(outputJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [outputJson]);

  const handleDownload = useCallback(() => {
    if (!outputJson) return;
    const blob = new Blob([outputJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'settings-catalog-policy.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [outputJson]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-[24px] leading-[32px] font-semibold text-fluent-text">OMA-URI → Settings Catalog Converter</h1>
      <p className="mt-2 text-[14px] leading-[22px] text-fluent-text-secondary max-w-3xl">
        Paste or upload a custom OMA-URI profile as JSON (rows with an OMA-URI/CSP path and a value) to
        produce the equivalent Settings Catalog policy JSON. Each OMA-URI is matched against the Settings
        Catalog by its CSP path (baseUri + offsetUri). Conversion runs entirely in your browser — nothing is uploaded.
      </p>

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        {/* ── Input ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <label htmlFor="oma-uri-input" className="text-[13px] font-semibold text-fluent-text">
              OMA-URI policy (JSON)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_INPUT)}
                className="text-[12px] text-fluent-blue hover:underline"
              >
                Load example
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[12px] px-2 py-1 rounded border border-fluent-border hover:bg-fluent-bg dark:hover:bg-white/5"
              >
                Upload file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
          <textarea
            id="oma-uri-input"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            spellCheck={false}
            placeholder={SAMPLE_INPUT}
            className="w-full h-72 font-mono text-[12px] leading-[18px] p-3 rounded border border-fluent-border bg-white dark:bg-[#1c1c1e] text-fluent-text resize-y"
          />

          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="policy-name" className="text-[13px] text-fluent-text-secondary whitespace-nowrap">
              Policy name
            </label>
            <input
              id="policy-name"
              type="text"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              className="flex-1 text-[13px] px-2 py-1.5 rounded border border-fluent-border bg-white dark:bg-[#1c1c1e] text-fluent-text"
            />
          </div>

          <button
            type="button"
            onClick={handleConvert}
            disabled={isConverting}
            className="mt-3 px-5 py-2 bg-[#0078d4] text-white text-[14px] font-semibold rounded hover:bg-[#106ebe] transition-colors disabled:opacity-60"
          >
            {isConverting ? 'Converting…' : 'Convert'}
          </button>

          {error && (
            <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* ── Output ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[13px] font-semibold text-fluent-text">
              Settings Catalog policy (JSON)
              {result && (
                <span className="ml-2 font-normal text-fluent-text-secondary">
                  {result.convertedCount}/{result.totalCount} converted
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!outputJson}
                className="text-[12px] px-2 py-1 rounded border border-fluent-border hover:bg-fluent-bg dark:hover:bg-white/5 disabled:opacity-50"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!outputJson}
                className="text-[12px] px-2 py-1 rounded border border-fluent-border hover:bg-fluent-bg dark:hover:bg-white/5 disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={outputJson}
            placeholder="Converted policy JSON will appear here."
            spellCheck={false}
            className="w-full h-72 font-mono text-[12px] leading-[18px] p-3 rounded border border-fluent-border bg-white dark:bg-[#1c1c1e] text-fluent-text resize-y"
          />
        </div>
      </div>

      {/* ── Per-row results ── */}
      {result && (
        <div className="mt-8">
          <h2 className="text-[16px] leading-[22px] font-semibold text-fluent-text mb-3">Row results</h2>
          <div className="overflow-x-auto rounded border border-fluent-border">
            <table className="w-full text-[13px]">
              <thead className="bg-fluent-bg dark:bg-[#2c2c2e] text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold text-fluent-text">OMA-URI</th>
                  <th className="px-3 py-2 font-semibold text-fluent-text">Value</th>
                  <th className="px-3 py-2 font-semibold text-fluent-text">Matched setting</th>
                  <th className="px-3 py-2 font-semibold text-fluent-text">Status</th>
                  <th className="px-3 py-2 font-semibold text-fluent-text">Message</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t border-fluent-border">
                    <td className="px-3 py-2 font-mono text-[12px] text-fluent-text-secondary break-all">{row.input.omaUri}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-fluent-text-secondary">{JSON.stringify(row.input.value)}</td>
                    <td className="px-3 py-2 text-fluent-text">{row.matchedDisplayName || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusStyles[row.status]}`}>
                        {statusLabels[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-fluent-text-secondary">{row.message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
