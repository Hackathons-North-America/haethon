"use client";

import { useState } from "react";
import { BadgeCheck, Undo2 } from "lucide-react";

import type { AttendanceAnomalyFinding, AttendanceAnomalyType } from "@/lib/hackathons/attendance-anomalies";

const TYPE_LABELS: Record<AttendanceAnomalyType, string> = {
  high_volume: "High volume",
  same_day_overlap: "Same day in person overlap",
  post_signup_burst: "Claim burst after signup",
  late_claim_ratio: "High late claim ratio",
};

const TYPE_ORDER: AttendanceAnomalyType[] = ["same_day_overlap", "post_signup_burst", "high_volume", "late_claim_ratio"];

type ResolutionState = { status: "verifying" | "revoking" | "verified" | "revoked" | "error"; message?: string };

function pairKey(userId: string, hackathonId: string) {
  return `${userId}:${hackathonId}`;
}

function FindingRow({
  finding,
  onResolve,
  resolutions,
}: {
  finding: AttendanceAnomalyFinding;
  onResolve: (userId: string, hackathonId: string, action: "verify" | "revoke") => void;
  resolutions: Map<string, ResolutionState>;
}) {
  return (
    <article className="rounded-xl border border-ink/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-ink dark:text-paper">{finding.userName}</p>
        <p className="text-sm text-ink/55 dark:text-paper/55">{finding.userEmail}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            finding.severity === "high" ? "bg-[#B42318]/10 text-[#B42318]" : "bg-[#B54708]/10 text-[#B54708]"
          }`}
        >
          {finding.severity}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/70 dark:text-paper/70">{finding.summary}</p>
      <ul className="mt-3 space-y-2">
        {finding.hackathons.map((hackathon) => {
          const resolution = resolutions.get(pairKey(finding.userId, hackathon.id));
          const busy = resolution?.status === "verifying" || resolution?.status === "revoking";
          const settled = resolution?.status === "verified" || resolution?.status === "revoked";

          return (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 px-3 py-2"
              key={hackathon.id}
            >
              <span className="text-sm font-semibold text-ink dark:text-paper">{hackathon.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                {resolution?.message ? (
                  <span
                    className={`text-sm font-semibold ${resolution.status === "error" ? "text-[#B42318]" : "text-[#362519]"}`}
                  >
                    {resolution.message}
                  </span>
                ) : null}
                {settled ? null : (
                  <>
                    <button
                      className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#362519] px-3 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={busy}
                      onClick={() => onResolve(finding.userId, hackathon.id, "verify")}
                      type="button"
                    >
                      <BadgeCheck aria-hidden="true" className="size-4" />
                      {resolution?.status === "verifying" ? "Verifying..." : "Verify"}
                    </button>
                    <button
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#B42318] px-3 text-sm font-semibold text-[#B42318] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => onResolve(finding.userId, hackathon.id, "revoke")}
                      type="button"
                    >
                      <Undo2 aria-hidden="true" className="size-4" />
                      {resolution?.status === "revoking" ? "Revoking..." : "Revoke"}
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function AttendanceAnomalyManager({ findings }: { findings: AttendanceAnomalyFinding[] }) {
  const [resolutions, setResolutions] = useState<Map<string, ResolutionState>>(new Map());

  function setResolution(key: string, state: ResolutionState) {
    setResolutions((current) => new Map(current).set(key, state));
  }

  async function resolve(userId: string, hackathonId: string, action: "verify" | "revoke") {
    const key = pairKey(userId, hackathonId);

    setResolution(key, { status: action === "verify" ? "verifying" : "revoking" });

    const response = await fetch("/api/admin/attendance-anomalies/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, hackathonId, action }),
    });
    const result = (await response.json()) as { data?: { affectedDayCount: number }; error?: unknown };

    if (!response.ok || !result.data) {
      setResolution(key, {
        status: "error",
        message: typeof result.error === "string" ? result.error : "Could not resolve the claim.",
      });
      return;
    }

    setResolution(
      key,
      action === "verify"
        ? { status: "verified", message: `Verified (${result.data.affectedDayCount} days upgraded).` }
        : { status: "revoked", message: `Revoked (${result.data.affectedDayCount} days removed).` }
    );
  }

  if (!findings.length) {
    return (
      <p className="rounded-xl border border-ink/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-6 text-sm text-ink/55 dark:text-paper/55">
        No attendance anomalies detected. Self reported claims currently look statistically normal.
      </p>
    );
  }

  const groups = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    findings: findings.filter((finding) => finding.type === type),
  })).filter((group) => group.findings.length);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.type}>
          <h2 className="text-lg font-semibold text-ink dark:text-paper">
            {group.label}{" "}
            <span className="ml-1 rounded-full bg-paper dark:bg-white/5 px-2.5 py-0.5 text-sm font-semibold text-ink/70 dark:text-paper/70">
              {group.findings.length}
            </span>
          </h2>
          <div className="mt-3 space-y-4">
            {group.findings.map((finding, index) => (
              <FindingRow
                finding={finding}
                key={`${finding.userId}-${finding.type}-${index}`}
                onResolve={resolve}
                resolutions={resolutions}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
