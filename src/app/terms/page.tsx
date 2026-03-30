import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Terms of Service — Tract",
};

export default function TermsPage() {
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
              Terms of Service
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated: March 30, 2026
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              1. Acceptance of terms
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Tract, you agree to be bound by these Terms
              of Service. If you do not agree, do not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              2. Description of service
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Tract is a collaborative contract negotiation tool that provides
              version-controlled editing, participant management, and
              AI-assisted drafting. Tract is a tool for collaboration &mdash; it
              does not provide legal advice and is not a substitute for
              professional legal counsel.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              3. User accounts
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You must provide a valid email address to create an account. You
              are responsible for maintaining the security of your account and
              for all activity that occurs under it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              4. Your content
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of all contract content you create on Tract.
              By using the service, you grant us a limited license to store,
              process, and display your content as necessary to provide the
              service to you and your collaborators.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              5. Acceptable use
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to use Tract for any unlawful purpose or in any way
              that could damage, disable, or impair the service. You may not
              attempt to gain unauthorized access to any part of the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              6. AI features
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Tract&apos;s AI features generate content based on your input and
              existing contract text. AI-generated content is provided as a
              suggestion only. You are responsible for reviewing and approving
              any AI-generated changes before they become part of your contract.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              7. No legal advice
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Tract is a collaboration and editing tool. Nothing in the service
              constitutes legal advice. You should consult a qualified attorney
              for legal guidance regarding your contracts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              8. Limitation of liability
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Tract is provided &ldquo;as is&rdquo; without warranties of any
              kind. To the maximum extent permitted by law, we shall not be
              liable for any indirect, incidental, special, or consequential
              damages arising from your use of the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              9. Termination
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We may suspend or terminate your access to Tract at any time for
              violation of these terms. You may stop using the service at any
              time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              10. Changes to terms
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these terms at any time. Continued
              use of the service after changes constitutes acceptance of the
              updated terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              11. Contact
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about these terms, please contact us at{" "}
              <a
                href="mailto:uri.valevski@gmail.com"
                className="text-accent underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                uri.valevski@gmail.com
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
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
