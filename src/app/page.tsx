"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/components/login-form";
import { CommitAnimation } from "@/components/commit-animation";

export default function HomePage() {
  const { user } = db.useAuth();
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);

  // When user logs in from the landing page dialog, navigate to the app
  useEffect(() => {
    if (user && showLogin) {
      router.push("/app");
    }
  }, [user, showLogin, router]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-6 h-14">
          <span className="text-base font-semibold tracking-tight">tract</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <Button size="sm" variant="outline" onClick={() => router.push("/app")}>
                Go to app
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowLogin(true)}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-20">
          <div className="grid md:grid-cols-[1fr_auto] gap-12 md:gap-16 items-center">
            <div className="max-w-lg space-y-6 page-enter">
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
                Documents that track
                <br />
                every change.
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Tract brings version control to collaborative writing.
                Contracts, design docs, proposals, anything where multiple
                people need to converge on one version. Every edit is a commit.
                Approve changes line by line until everyone agrees.
              </p>
              <div className="flex items-center gap-3 pt-2">
                {user ? (
                  <Button size="lg" onClick={() => router.push("/app")}>
                    Go to app
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => setShowLogin(true)}>
                    Get started
                  </Button>
                )}
              </div>
            </div>
            <div className="page-enter" style={{ animationDelay: "0.15s" }}>
              <CommitAnimation />
            </div>
          </div>
        </section>

        {/* Problem: Google Docs isn't enough */}
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-8">
              The problem
            </p>
            <h2 className="text-2xl font-semibold tracking-tight mb-6">
              Google Docs has version history. It&apos;s not enough.
            </h2>
            <div className="grid sm:grid-cols-3 gap-10">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold tracking-tight">
                  One owner decides
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  In Google Docs, one person owns the document. Everyone else
                  suggests. The owner accepts or rejects. That works for a memo,
                  not for a contract where both sides have equal say, or a
                  design doc where three teams need to sign off.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold tracking-tight">
                  No independent work
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Everyone edits the same document at the same time. If you want
                  to try a different direction, you have to copy the doc. Now
                  you have two files, no way to compare them, and no path to
                  merge them back together.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold tracking-tight">
                  No clear agreement
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Version history tells you what changed and when. It
                  doesn&apos;t tell you who has approved which version. When
                  three people are negotiating a contract or reviewing a
                  proposal, there&apos;s no way to see where everyone stands.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Solution: How Tract works */}
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-8">
              How Tract works
            </p>
            <h2 className="text-2xl font-semibold tracking-tight mb-4">
              Git for documents.
            </h2>
            <div className="max-w-2xl space-y-3 text-muted-foreground leading-relaxed">
              <p>
                Every edit creates a new version in a commit history. Each
                participant points to the version they currently approve.
                You can see exactly where everyone stands at a glance.
              </p>
              <p>
                Anyone can branch off, try a different approach, and propose it
                back. No one is blocked. When someone proposes changes, you
                review them line by line, accept some, reject others, just like
                a code review. No more all-or-nothing redlines.
              </p>
            </div>
          </div>
        </section>

        {/* How it works — steps */}
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-8">
              The workflow
            </p>
            <div className="grid sm:grid-cols-3 gap-10">
              {[
                {
                  step: "01",
                  title: "Write & commit",
                  desc: "Draft your document in markdown. Every save is a versioned commit with a description of what changed.",
                },
                {
                  step: "02",
                  title: "Invite & compare",
                  desc: "Add participants by email. Each person has their own version pointer. See line-by-line diffs between any two versions.",
                },
                {
                  step: "03",
                  title: "Approve & converge",
                  desc: "Review changes individually — accept the ones you want, skip the rest. When all participants point to the same version, you have consensus.",
                },
              ].map((item) => (
                <div key={item.step} className="space-y-3">
                  <span className="text-xs font-mono text-accent">
                    {item.step}
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI feature */}
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <div className="max-w-lg space-y-4">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                    color: "white",
                  }}
                >
                  T
                </span>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  AI-assisted
                </p>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Ask Tract to draft changes for you.
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Describe what you want in plain language &mdash; &ldquo;add a
                termination clause with 30-day notice&rdquo; or &ldquo;rewrite
                section 3 to be less ambiguous&rdquo; &mdash; and Tract&apos;s
                AI writes the revision as a new commit. Review it like any
                other change and adopt it if you agree.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-20 text-center">
            <h2 className="text-2xl font-semibold tracking-tight mb-3">
              Stop emailing drafts back and forth.
            </h2>
            <p className="text-muted-foreground mb-6">
              Works for contracts, design docs, proposals, and any document
              that needs sign-off. Free to use.
            </p>
            {user ? (
              <Button size="lg" onClick={() => router.push("/app")}>
                Go to app
              </Button>
            ) : (
              <Button size="lg" onClick={() => setShowLogin(true)}>
                Start negotiating
              </Button>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center gap-4 text-xs text-muted-foreground">
          <span>Tract</span>
          <a href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </a>
        </div>
      </footer>

      {/* Login overlay */}
      {showLogin && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-card border border-border rounded-lg p-8 shadow-lg max-w-sm w-full page-enter">
            <button
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground text-sm"
              onClick={() => setShowLogin(false)}
            >
              &times;
            </button>
            <LoginForm />
          </div>
        </div>
      )}
    </div>
  );
}
