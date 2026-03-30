"use client";

import { useState, useRef, useEffect } from "react";
import db from "@/lib/instant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthStep = "email" | "code";

const GUEST_TIMEOUT_MS = 15_000;

export function LoginForm() {
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await db.auth.sendMagicCode({ email });
      setStep("code");
    } catch {
      setError("Failed to send code. Check your email and try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await db.auth.signInWithMagicCode({ email, code });
    } catch (err) {
      console.error("[tract] magic code verification failed", err);
      // signInWithMagicCode can update auth state (logging the user in)
      // but still throw during post-auth cleanup. When that happens,
      // AuthGate will unmount this component on the next React render.
      // We defer the error so React can process the auth state change
      // first — if we're still mounted after that, it's a real error.
      await new Promise((r) => setTimeout(r, 100));
      if (mountedRef.current) {
        setError("Invalid code. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">tract</h1>
        <p className="text-sm text-muted-foreground">
          Version-controlled contract negotiation. Every edit is tracked, every participant has their own version.
        </p>
        <p className="text-sm text-muted-foreground">
          {step === "email"
            ? "Enter your email to sign in or create an account."
            : `We sent a code to ${email}`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={sending || guestLoading}>
            {sending ? "Sending..." : "Continue with email"}
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={sending || guestLoading}
            onClick={async () => {
              setError(null);
              setGuestLoading(true);
              try {
                const result = await Promise.race([
                  db.auth.signInAsGuest(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("timeout")),
                      GUEST_TIMEOUT_MS,
                    ),
                  ),
                ]);
                // If we get here, auth succeeded — component will unmount
                // when AuthGate detects the user.
                console.log("[tract] guest sign-in succeeded", result);
              } catch (err) {
                console.error("[tract] guest sign-in failed", err);
                setError(
                  err instanceof Error && err.message === "timeout"
                    ? "Guest sign-in timed out. Please try again."
                    : "Failed to sign in as guest. Please try again.",
                );
                setGuestLoading(false);
              }
            }}
          >
            {guestLoading ? "Signing in..." : "Try as guest"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              placeholder="Enter code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Verifying..." : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </form>
      )}
    </div>
  );
}
