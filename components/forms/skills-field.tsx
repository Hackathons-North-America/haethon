"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { SKILL_LANGUAGES } from "@/lib/profile/skills";

type SkillsFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
};

const basePillClassName =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition";
const selectedPillClassName =
  "border-pine bg-pine text-paper dark:border-moss dark:bg-moss dark:text-[#141414]";
const unselectedPillClassName =
  "border-ink/15 bg-white text-ink/75 hover:border-pine hover:text-pine dark:border-white/15 dark:bg-white/[0.06] dark:text-paper/75 dark:hover:border-moss/60 dark:hover:text-moss";

function matches(query: string, value: string) {
  return value.toLowerCase().includes(query);
}

export function SkillsField({ value, onChange }: SkillsFieldProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const normalizedQuery = query.trim().toLowerCase();

  // For each language, work out what to show for the current search. A language
  // group appears if its name matches (then all frameworks show) or if any of
  // its frameworks match (then only the matching frameworks show).
  const groups = useMemo(() => {
    return SKILL_LANGUAGES.map((language) => {
      if (!normalizedQuery) {
        return { language, frameworks: language.frameworks };
      }

      if (matches(normalizedQuery, language.name)) {
        return { language, frameworks: language.frameworks };
      }

      const frameworks = language.frameworks.filter((framework) => matches(normalizedQuery, framework));
      return frameworks.length ? { language, frameworks } : null;
    }).filter((group): group is { language: (typeof SKILL_LANGUAGES)[number]; frameworks: readonly string[] } =>
      group !== null
    );
  }, [normalizedQuery]);

  function toggle(skill: string) {
    onChange(selected.has(skill) ? value.filter((item) => item !== skill) : [...value, skill]);
  }

  function Pill({ skill, isLanguage }: { skill: string; isLanguage?: boolean }) {
    const isSelected = selected.has(skill);

    return (
      <button
        type="button"
        onClick={() => toggle(skill)}
        aria-pressed={isSelected}
        className={`${basePillClassName} ${isSelected ? selectedPillClassName : unselectedPillClassName} ${
          isLanguage ? "font-semibold" : ""
        }`}
      >
        {isSelected ? <Check aria-hidden="true" className="size-3.5" /> : null}
        {skill}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40 dark:text-paper/40"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search languages & frameworks"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-white dark:bg-white/[0.06] py-2 pl-9 pr-3 text-sm text-ink dark:text-paper outline-none transition placeholder:text-ink/45 dark:placeholder:text-paper/40 focus:border-pine focus:ring-2 focus:ring-pine/15"
          />
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/55 dark:text-paper/55">
          {value.length} selected
        </span>
      </div>

      <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-ink/10 dark:border-white/10 bg-ink/[0.02] dark:bg-white/[0.02] p-4">
        {groups.length ? (
          groups.map(({ language, frameworks }) => (
            <div key={language.name}>
              <div className="flex flex-wrap items-center gap-2">
                <Pill skill={language.name} isLanguage />
                <span aria-hidden="true" className="text-ink/25 dark:text-paper/25">
                  ·
                </span>
                {frameworks.map((framework) => (
                  <Pill key={framework} skill={framework} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink/55 dark:text-paper/55">No languages or frameworks match “{query}”.</p>
        )}
      </div>
    </div>
  );
}
