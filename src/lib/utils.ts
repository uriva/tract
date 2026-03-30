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
