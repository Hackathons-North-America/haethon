/**
 * The skills taxonomy backing the profile "Skills" selector.
 *
 * Skills are stored on `user_profiles.skills` as a flat `string[]` of tokens.
 * Both a language name (e.g. "Python") and any of its frameworks
 * (e.g. "Django") are selectable and are stored as their plain display string.
 *
 * Every token below is unique across the whole taxonomy, so a stored string
 * maps back to exactly one language/framework — no disambiguation needed.
 */

export type SkillLanguage = {
  /** The language itself — selectable, and the group heading in the editor. */
  name: string;
  /** ~5-6 popular frameworks/libraries in this language's ecosystem. */
  frameworks: readonly string[];
};

export const SKILL_LANGUAGES: readonly SkillLanguage[] = [
  { name: "JavaScript", frameworks: ["React", "Vue", "Angular", "Svelte", "Express", "Next.js"] },
  { name: "TypeScript", frameworks: ["NestJS", "Deno", "tRPC", "Zod", "Remix", "SvelteKit"] },
  { name: "Python", frameworks: ["Django", "Flask", "FastAPI", "Pandas", "PyTorch", "Streamlit"] },
  { name: "Java", frameworks: ["Spring Boot", "Hibernate", "Quarkus", "Micronaut", "Struts", "JSF"] },
  { name: "C#", frameworks: [".NET", "ASP.NET Core", "Blazor", "Entity Framework", "Unity", ".NET MAUI"] },
  { name: "C++", frameworks: ["Qt", "Boost", "POCO", "JUCE", "wxWidgets", "Unreal Engine"] },
  { name: "C", frameworks: ["GTK", "libuv", "SDL", "GLib", "Check", "CMocka"] },
  { name: "Go", frameworks: ["Gin", "Echo", "Fiber", "Beego", "Chi", "GORM"] },
  { name: "Rust", frameworks: ["Actix", "Rocket", "Axum", "Tokio", "Tauri", "Yew"] },
  { name: "Swift", frameworks: ["SwiftUI", "UIKit", "Vapor", "Combine", "Core Data", "SpriteKit"] },
] as const;

/**
 * Every selectable token, in canonical order (each language, then its
 * frameworks). Used both to validate incoming skills and to render selections
 * in a stable order regardless of the order the user clicked them.
 */
const SKILL_VALUES: readonly string[] = SKILL_LANGUAGES.flatMap((language) => [
  language.name,
  ...language.frameworks,
]);

/**
 * Reduce arbitrary input to a deduped list of known skills in canonical order.
 * Filtering the canonical list gives us de-duplication and stable ordering for
 * free, and silently drops anything not in the taxonomy.
 */
export function sanitizeSkills(values: readonly string[]): string[] {
  const chosen = new Set(values);
  return SKILL_VALUES.filter((value) => chosen.has(value));
}
