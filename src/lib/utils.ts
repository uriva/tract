import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Always apply formatting on Markdown content to normalize trailing whitespace and double blank lines. */
export function normalizeMarkdown(text: string): string {
  if (!text) return "";

  // Replace invisible zero-width spaces and convert non-breaking spaces to standard spaces
  let cleaned = text.replace(/\u200B/g, "");
  cleaned = cleaned.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");

  const lines = cleaned.split("\n");
  const normalizedLines = lines.map((line) => {
    const trimmedLine = line.trimEnd();
    const isHardBreak = line.endsWith("  ") && !line.endsWith("   ") && line.trim() !== "";

    const match = trimmedLine.match(/^(\s*)(.*)$/);
    if (match) {
      const indent = match[1];
      const content = match[2];
      const normalizedContent = content.replace(/ {2,}/g, " ");
      const baseLine = indent + normalizedContent;
      return isHardBreak ? baseLine + "  " : baseLine;
    }
    return trimmedLine;
  });

  // Remove consecutive empty lines (allow max 1 consecutive empty line, i.e., max one empty line between blocks)
  const resultLines: string[] = [];
  let isPrevEmpty = false;
  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i];
    const isEmpty = line === "";
    if (isEmpty) {
      if (!isPrevEmpty) {
        resultLines.push("");
      }
      isPrevEmpty = true;
    } else {
      resultLines.push(line);
      isPrevEmpty = false;
    }
  }

  // Clean up empty lines at the start and end of the document
  while (resultLines.length > 0 && resultLines[0] === "") {
    resultLines.shift();
  }
  while (resultLines.length > 0 && resultLines[resultLines.length - 1] === "") {
    resultLines.pop();
  }

  // Always end the document with exactly one trailing newline (POSIX style)
  return resultLines.length > 0 ? resultLines.join("\n") + "\n" : "";
}

/** Display name for a user — handles guests (no email) and regular users. */
export function displayName(email: string | null | undefined, userId?: string): string {
  if (email) return email.split("@")[0];
  if (userId) return `guest-${userId.slice(0, 4)}`;
  return "guest";
}

/** Neutral participant colors (no red/green to avoid diff confusion). */
export const PARTICIPANT_COLORS = [
  "#7c8ab8", // slate blue
  "#b08d57", // warm tan
  "#8b7bb8", // soft purple
  "#6d9eeb", // sky blue
  "#76a5af", // teal
  "#b87878", // muted rose
];

/** Tract AI commit color */
export const TRACT_COLOR = "#6d9eeb";

/**
 * Assign a stable color to each participant based on their index in the
 * participants array. Returns a Map<participantId, color>.
 */
export function assignParticipantColors(
  participants: { id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  participants.forEach((p, i) => {
    map.set(p.id, PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length]);
  });
  return map;
}
