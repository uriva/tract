import { toast } from "sonner";

/**
 * Builds a rejection handler for a user-triggered async action: logs the
 * failure and surfaces it as a toast, so a rejected promise never escapes as
 * an unhandled rejection.
 */
export function reportError(message: string) {
  return (error: unknown) => {
    console.error(`[tract] ${message}`, error);
    toast.error(message);
  };
}
