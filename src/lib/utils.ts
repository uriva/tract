import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
