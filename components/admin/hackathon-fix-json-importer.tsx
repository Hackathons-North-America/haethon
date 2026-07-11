"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type FixImportResult = {
  duplicateScore: number;
  index: number;
  matchedHackathonId?: string;
  name: string;
  reason: string;
  source: string;
  sourceUrl: string;
  submissionId: string;
};

type FixImportResponse = {
  data?: {
    queuedCount: number;
    results: FixImportResult[];
    total: number;
  };
  error?: unknown;
};

type PreviewItem = {
  name: string;
  reason: string;
  source: string;
  sourceUrl: string;
};

const sampleFixJson = `[
  {
    "source": "luma",
    "reason": "missing country",
    "sourceUrl": "https://luma.com/fxeizoz7",
    "raw": {
      "event": {
        "api_id": "evt-sifYdPT7PVNPyde",
        "name": "FlutterFlow Champions League 2026 - Hyderabad Edition",
        "start_at": "2026-07-05T04:30:00.000Z",
        "end_at": "2026-07-05T12:30:00.000Z",
        "location_type": "offline",
        "geo_address_info": {
          "address": "The Commons Food Hall, 1st Floor, Phoenix Equinox, Hyderabad"
        }
      }
    }
  }
]`;

function stringifyError(error: unknown) {
  return typeof error === "string" ? error : JSON.stringify(error, null, 2);
}

function objectValue(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function previewItems(value: unknown): PreviewItem[] {
  const items = Array.isArray(value) ? value : objectValue(value, "items");

  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, 25).map((item, index) => {
    const raw = objectValue(item, "raw");
    const event = objectValue(raw, "event") ?? raw;
    const sourceUrl = stringValue(objectValue(item, "sourceUrl"));
    const eventUrl = stringValue(objectValue(event, "url"));

    return {
      name: stringValue(objectValue(event, "name")) || `Imported item ${index + 1}`,
      reason: stringValue(objectValue(item, "reason")) || "Needs review",
      source: stringValue(objectValue(item, "source")) || "unknown",
      sourceUrl: sourceUrl || (eventUrl ? `https://luma.com/${eventUrl}` : ""),
    };
  });
}

export function HackathonFixJsonImporter() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<FixImportResult[]>([]);

  const preview = useMemo(() => {
    if (!jsonText.trim()) {
      return [];
    }

    try {
      return previewItems(JSON.parse(jsonText));
    } catch {
      return [];
    }
  }, [jsonText]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);
    setResults([]);

    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setStatus("error");
      setMessage("Invalid JSON.");
      return;
    }

    const response = await fetch("/api/admin/hackathon-fix-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    const body = (await response.json()) as FixImportResponse;

    if (!response.ok || !body.data) {
      setStatus("error");
      setMessage(body.error ? stringifyError(body.error) : "Import failed.");
      return;
    }

    setStatus("success");
    setMessage(`${body.data.queuedCount} imported into the fix queue.`);
    setResults(body.data.results);
    router.refresh();
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Fix queue import</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy dark:text-wheat">Broken scraped JSON</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/55 dark:text-wheat/55">
            Import records with `source`, `reason`, `sourceUrl`, and `raw`. Each item becomes a pending review card with editable fields and the fix reason attached.
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet hover:bg-[#5c151c] px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
          disabled={status === "submitting" || !jsonText.trim()}
          type="submit"
        >
          <Upload aria-hidden="true" className="size-4" />
          {status === "submitting" ? "Queueing" : "Queue fixes"}
        </button>
      </div>

      <textarea
        aria-label="Broken hackathon JSON"
        className="min-h-72 w-full rounded-xl border border-navy/15 dark:border-white/15 bg-ivory dark:bg-white/5 p-4 font-mono text-xs leading-5 text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15"
        onChange={(event) => setJsonText(event.target.value)}
        placeholder={sampleFixJson}
        spellCheck={false}
        value={jsonText}
      />

      {preview.length ? (
        <div className="overflow-hidden rounded-xl border border-navy/10 dark:border-white/10">
          <div className="grid grid-cols-[1fr_0.75fr_0.9fr] gap-3 border-b border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55">
            <span>Pre-populated event</span>
            <span>Source</span>
            <span>Reason</span>
          </div>
          <div className="divide-y divide-navy/10 dark:divide-white/10 bg-white dark:bg-white/[0.06]">
            {preview.map((item, index) => (
              <div className="grid grid-cols-[1fr_0.75fr_0.9fr] gap-3 px-4 py-3 text-sm" key={`${item.sourceUrl}-${index}`}>
                <span className="font-semibold text-navy dark:text-wheat">{item.name}</span>
                <span className="truncate text-navy/55 dark:text-wheat/55">{item.source}</span>
                <span className="text-[#B54708]">{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            status === "error"
              ? "border-[#B42318]/30 bg-[#FEF3F2] text-[#B42318]"
              : "border-[#027A48]/25 bg-[#ECFDF3] text-[#027A48]"
          }`}
        >
          {status === "error" ? (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <pre className="whitespace-pre-wrap font-sans">{message}</pre>
        </div>
      ) : null}

      {results.length ? (
        <div className="overflow-hidden rounded-xl border border-navy/10 dark:border-white/10">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 border-b border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55">
            <span>Queued item</span>
            <span>Duplicate</span>
            <span>Reason</span>
          </div>
          <div className="divide-y divide-navy/10 dark:divide-white/10 bg-white dark:bg-white/[0.06]">
            {results.map((result) => (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-4 py-3 text-sm" key={result.submissionId}>
                <span className="font-semibold text-navy dark:text-wheat">{result.name}</span>
                <span className="text-navy/55 dark:text-wheat/55">{result.duplicateScore.toFixed(2)}</span>
                <span className="inline-flex items-start gap-2 text-[#B54708]">
                  <FileWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {result.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
