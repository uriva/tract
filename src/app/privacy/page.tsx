import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Privacy Policy — Tract",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between px-6 h-14">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight hover:opacity-70 transition-opacity"
          >
            tract
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-16">
        <article className="prose-contract space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated: March 30, 2026
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              1. Information we collect
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use Tract, we collect the following information:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>
                <strong className="text-foreground">Email address</strong> — used for authentication and to identify you to other
                contract participants.
              </li>
              <li>
                <strong className="text-foreground">Contract content</strong> — the text of contracts you create and edit,
                including all committed versions.
              </li>
              <li>
                <strong className="text-foreground">Usage data</strong> — basic interaction data such as page views and feature
                usage, collected to improve the service.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              2. How we use your information
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>To provide and maintain the Tract service.</li>
              <li>To authenticate your identity and manage your account.</li>
              <li>To enable collaboration between contract participants.</li>
              <li>
                To process contract content through AI features when you
                explicitly request it (e.g., &ldquo;Ask Tract&rdquo;).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              3. AI processing
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use the &ldquo;Ask Tract&rdquo; feature, your contract
              content and prompt are sent to a third-party AI provider (Google
              Gemini) to generate revisions. This only happens when you
              explicitly request it. We do not use your contract content for AI
              model training.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              4. Data sharing
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal information. Your contract content is
              shared only with participants you invite. We may share data with
              service providers who help us operate the platform (hosting,
              database, AI processing), subject to appropriate data protection
              agreements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              5. Data storage and security
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored using InstantDB, a cloud database service.
              We use industry-standard security measures to protect your
              information, including encrypted connections and access controls.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              6. Your rights
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You may request access to, correction of, or deletion of your
              personal data at any time by contacting us. You can delete your
              account by signing out and requesting removal.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              7. Changes to this policy
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy from time to time. We will notify you
              of any material changes by posting the updated policy on this
              page with a revised date.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              8. Contact
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this privacy policy, please open an
              issue on our{" "}
              <a
                href="https://github.com/uriva/tract"
                className="text-accent underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                GitHub repository
              </a>
              .
            </p>
          </section>
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Tract
          </Link>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
