"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import db from "@/lib/instant";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/components/login-form";

export default function HomePage() {
  const { user } = db.useAuth();
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);

  // If already signed in and they land on /, let them go to /app via button
  // but always show the landing page

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
          <div className="max-w-2xl space-y-6 page-enter">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
              Contracts that track
              <br />
              every change.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
              Tract brings version control to contract negotiation. Every edit
              is a commit. Every participant has their own version. Approve
              changes line by line until everyone agrees.
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
        </section>

        {/* Problem / Solution */}
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <div className="grid md:grid-cols-2 gap-16">
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  The problem
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Contract negotiation is chaos.
                </h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    You email a draft. They send back changes. Someone else
                    edits a different version. Now there are three documents
                    floating around and nobody knows which is current.
                  </p>
                  <p>
                    Tracked changes in Word docs get messy fast. You lose
                    context about why a clause was changed. There is no clear
                    picture of who has agreed to what.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  How Tract works
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Git for contracts.
                </h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    Every edit creates a new version in a commit history. Each
                    participant points to the version they currently approve.
                    You can see exactly where everyone stands at a glance.
                  </p>
                  <p>
                    When someone proposes changes, you review them line by line
                    &mdash; accept some, reject others, just like a code review.
                    No more all-or-nothing redlines.
                  </p>
                </div>
              </div>
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
                  desc: "Draft your contract in markdown. Every save is a versioned commit with a description of what changed.",
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
                termination clause with 30-day notice&rdquo; &mdash; and
                Tract&apos;s AI writes the revision as a new commit. Review it
                like any other change and adopt it if you agree.
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
              Free to use. No credit card required.
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
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-muted-foreground">
          Tract
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
