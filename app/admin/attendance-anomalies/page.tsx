import { AttendanceAnomalyManager } from "@/components/admin/attendance-anomaly-manager";
import { detectAttendanceAnomalies } from "@/lib/hackathons/attendance-anomaly-service";

export const dynamic = "force-dynamic";

export default async function AdminAttendanceAnomaliesPage() {
  const findings = await detectAttendanceAnomalies();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-black/10 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Trust &amp; safety</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-black">Attendance anomalies</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-[#706F6B]">
              Statistical outliers in self-reported attendance. Verify a claim to mark its days admin-verified, or revoke it
              to remove the self-reported days and reset the status to interested.
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#F7F7F4] px-4 py-3 text-sm font-semibold text-black">
            {findings.length} flagged
          </div>
        </div>
      </section>

      <AttendanceAnomalyManager findings={findings} />
    </div>
  );
}
