// Turns whatever text a model produced into a JSON value, as leniently as possible:
// strips reasoning tags and code fences, fixes Python-style literals, comments,
// curly quotes and trailing commas, and salvages truncated output by closing it
// at the end or at progressively earlier cut points.

export interface ParseOutcome {
  value: unknown;
  /** true when the JSON had to be cut short / closed to parse */
  repaired: boolean;
}

const MAX_CUT_TRIES = 400;
/** how many opening brackets to try when prose before the JSON contains brackets */
const MAX_STARTS = 10;

export function parseModelJson(text: string): ParseOutcome | null {
  if (typeof text !== "string") return null;
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "") // reasoning whose opening tag was cut off
    .replace(/```[a-z]*\s*/gi, "")
    .trim();

  let fallback: ParseOutcome | null = null;
  let starts = 0;
  for (let i = 0; i < cleaned.length && starts < MAX_STARTS; i++) {
    if (cleaned[i] !== "{" && cleaned[i] !== "[") continue;
    starts++;
    const outcome = parseFrom(cleaned.slice(i));
    if (!outcome) continue;
    // prefer an object (or a list holding one) over e.g. a "[1]" footnote in prose
    if (isObjectLike(outcome.value)) return outcome;
    fallback ??= outcome;
  }
  return fallback;
}

function isObjectLike(v: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => typeof x === "object" && x !== null);
  return typeof v === "object" && v !== null;
}

function parseFrom(body: string): ParseOutcome | null {
  const { end, cuts, stack } = scan(body);
  if (end !== -1) {
    const exact = tryParse(body.slice(0, end + 1));
    if (exact !== undefined) return { value: exact, repaired: false };
  }

  // unterminated (or unparseable): close it at the end, then at earlier cut points
  const whole = tryParse(closeAt(body, body.length, stack));
  if (whole !== undefined) return { value: whole, repaired: true };
  for (let i = cuts.length - 1, tries = 0; i >= 0 && tries < MAX_CUT_TRIES; i--, tries++) {
    const v = tryParse(closeAt(body, cuts[i].index, cuts[i].stack));
    if (v !== undefined) return { value: v, repaired: true };
  }
  return null;
}

interface Cut {
  index: number;
  stack: string[];
}

/** finds the end of the first top-level value and records safe cut points (commas) */
function scan(s: string): { end: number; cuts: Cut[]; stack: string[] } {
  const stack: string[] = [];
  const cuts: Cut[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length === 0) return { end: i, cuts, stack };
    } else if (c === ",") cuts.push({ index: i, stack: [...stack] });
  }
  return { end: -1, cuts, stack };
}

function closeAt(s: string, index: number, stack: string[]): string {
  let head = s.slice(0, index);
  if (countUnescapedQuotes(head) % 2 === 1) head += '"'; // dangling string
  head = head.replace(/,\s*$/, "").replace(/:\s*$/, ": null");
  if (stack.at(-1) === "{") {
    // a key with no value yet
    head = head.replace(/([{,]\s*)"[^"]*"\s*$/, "$1").replace(/,\s*$/, "");
  }
  const closers = [...stack]
    .reverse()
    .map((c) => (c === "{" ? "}" : "]"))
    .join("");
  return head + closers;
}

function countUnescapedQuotes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === '"') n++;
  }
  return n;
}

function tryParse(s: string): unknown {
  for (const candidate of [s, sanitize(s)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

const LITERALS: Record<string, string> = {
  None: "null",
  True: "true",
  False: "false",
  undefined: "null",
  NaN: "null",
  Infinity: "null",
  "-Infinity": "null",
};

/** escapes a raw string body for use inside double quotes */
const escapeChar = (c: string) =>
  c === "\n" ? "\\n" : c === "\r" ? "" : c === "\t" ? "\\t" : c;

/** fixes common non-JSON output outside of strings */
function sanitize(s: string): string {
  let out = "";
  // the character that closes the current string: '"' or '”' (for “curly” strings)
  let closer: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (closer) {
      if (c === "\\") {
        out += c + (s[i + 1] ?? "");
        i++;
        continue;
      }
      if (c === closer) {
        out += '"';
        closer = null;
        continue;
      }
      // a straight quote inside a “curly” string is content
      out += c === '"' ? '\\"' : escapeChar(c);
      continue;
    }
    if (c === '"' || c === "“") {
      closer = c === '"' ? '"' : "”";
      out += '"';
      continue;
    }
    if (c === "'") {
      // Python-style 'single-quoted' string: ends at a quote followed by , : } ] or the end
      const end = findSingleQuoteEnd(s, i + 1);
      if (end !== -1) {
        let body = "";
        for (let j = i + 1; j < end; j++) {
          if (s[j] === "\\" && s[j + 1] === "'") {
            body += "'";
            j++;
          } else body += s[j] === '"' ? '\\"' : escapeChar(s[j]);
        }
        out += `"${body}"`;
        i = end;
        continue;
      }
    }
    if (c === "/" && s[i + 1] === "/") {
      // line comment outside a string
      while (i < s.length && s[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    const word = s.slice(i, i + 10).match(/^(None|True|False|undefined|NaN|-?Infinity)(?![\w$])/);
    if (word && !/[\w$]/.test(s[i - 1] ?? "")) {
      out += LITERALS[word[1]];
      i += word[1].length - 1;
      continue;
    }
    out += c;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

function findSingleQuoteEnd(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "'" && /^\s*([,:}\]]|$)/.test(s.slice(j + 1, j + 24))) return j;
    if (s[j] === "\n") return -1;
  }
  return -1;
}
