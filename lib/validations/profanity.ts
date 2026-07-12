// Lightweight profanity screen for user-chosen names, handles, and profile text.
//
// Two matching modes keep false positives down (the "Scunthorpe problem"):
// - SUBSTRING_TERMS are offensive in any position, so they match anywhere
//   in the normalized input (separators stripped).
// - WORD_TERMS appear inside ordinary words ("classy", "Hancock", "Essex"),
//   so they only match as standalone tokens.
//
// Normalization folds common evasions (leetspeak digits/symbols, separator
// padding, repeated letters) before matching. This is a deterrent, not a
// guarantee — a determined user can always outrun a blocklist.

const SUBSTRING_TERMS = [
  "fuck",
  "phuck",
  "asshole",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "wanker",
  "bollock",
  "blowjob",
  "handjob",
  "dildo",
  "cumshot",
  "jizz",
  "wetback",
  "tranny",
  "whore",
  "slut",
  "bitch",
  "biatch",
  "pussy",
  "rimjob",
  "felch",
  "smegma",
  "retard",
];

const WORD_TERMS = [
  "shit",
  "shite",
  "ass",
  "arse",
  "anal",
  "anus",
  "cock",
  "dick",
  "twat",
  "tit",
  "tits",
  "cum",
  "fag",
  "fags",
  "fuk",
  "hoe",
  "hoes",
  "damn",
  "piss",
  "prick",
  "sex",
  "porn",
  "porno",
  "rape",
  "rapist",
  "nazi",
  "penis",
  "vagina",
  "boob",
  "boobs",
  "queef",
  "coon",
  "spic",
  "kike",
  "chink",
  "clit",
  "wank",
  "spunk",
  "semen",
  "scrotum",
  "testicle",
];

// Real words/names that contain a SUBSTRING_TERM once separators are
// stripped. Removed from the haystack before the substring scan.
const ALLOWLIST = ["scunthorpe"];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
  "+": "t",
};

const foldLeet = (value: string) =>
  value.replace(/[0-9@$!|+]/g, (char) => LEET_MAP[char] ?? char);

// Collapse runs of the same letter ("fuuuck" -> "fuck"). No term in the
// lists above relies on doubled letters, so this is safe.
const collapseRepeats = (value: string) => value.replace(/(.)\1+/g, "$1");

const stripSeparators = (value: string) => value.replace(/[^a-z]/g, "");

const removeAllowlisted = (value: string) =>
  ALLOWLIST.reduce((acc, safe) => acc.split(safe).join(""), value);

const toLowerAscii = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");

const tokenize = (value: string) => value.split(/[^a-z]+/).filter(Boolean);

/**
 * Returns true when the input contains a blocklisted term, including common
 * leetspeak and separator-padding evasions ("f.u.c.k", "sh1t", "a$$hole").
 */
export function containsProfanity(value: string): boolean {
  if (!value) {
    return false;
  }

  const lower = toLowerAscii(value);
  const folded = foldLeet(lower);

  const joined = removeAllowlisted(stripSeparators(folded));
  const haystacks = [joined, collapseRepeats(joined)];

  for (const term of SUBSTRING_TERMS) {
    if (haystacks.some((haystack) => haystack.includes(term))) {
      return true;
    }
  }

  // Word terms match whole tokens only. Tokenize both the raw lowercase
  // string (digits act as separators, catching "dick4president") and the
  // leet-folded string (catching "sh1t" as a single token "shit").
  const tokens = new Set([...tokenize(lower), ...tokenize(folded)]);

  for (const token of tokens) {
    const candidates = [token, collapseRepeats(token)];

    if (WORD_TERMS.some((term) => candidates.includes(term))) {
      return true;
    }
  }

  return false;
}
