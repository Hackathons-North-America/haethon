"use client";

/* "Mark attended" on a past hackathon. The owning PastHackathonCard flips the
   card to Attended immediately and saves in the background. */
export function MarkAttendedButton({ onMark }: { onMark: () => void }) {
  return (
    <button
      className="inline-flex rounded-full min-h-8 items-center border border-pine px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine transition-colors hover:bg-pine hover:text-paper"
      onClick={onMark}
      type="button"
    >
      Mark attended
    </button>
  );
}
