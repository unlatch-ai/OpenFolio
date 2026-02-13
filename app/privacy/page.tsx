import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How OpenFolio collects, uses, and protects your personal information.",
  alternates: {
    canonical: "/privacy",
  },
};

const isSelfHosted =
  process.env.NEXT_PUBLIC_OPENFOLIO_MODE === "self-hosted";

const lastUpdated = "February 13, 2026";
const contactEmail = isSelfHosted ? null : "me@kevinfang.tech";
const companyName = isSelfHosted ? null : "Fang Labs LLC";
const mailingAddress = isSelfHosted ? null : ["2108 B ST", "STE N", "SACRAMENTO, CA 95816"];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/logo-mark.png"
              alt="OpenFolio logo"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="text-base font-semibold text-foreground">OpenFolio</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Privacy Policy
          </p>
          <h1 className="text-4xl font-serif font-semibold text-foreground">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        {isSelfHosted ? (
          <div className="mt-10 space-y-10">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">Self-hosted instance</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This is a self-hosted instance of OpenFolio. All data is stored on
                infrastructure controlled by the operator of this instance. OpenFolio
                is open-source software provided &quot;as is&quot; without warranty of any kind.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The operator of this instance is solely responsible for data handling,
                privacy compliance, and security. For questions about how your data is
                managed, contact your instance administrator.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                OpenFolio source code is available at{" "}
                <a
                  href="https://github.com/unlatch-ai/OpenFolio"
                  className="text-primary underline underline-offset-4"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/unlatch-ai/OpenFolio
                </a>
                .
              </p>
            </section>
          </div>
        ) : (
        <div className="mt-10 space-y-10">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Overview</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              OpenFolio provides an AI-powered personal CRM for professionals in the United
              States. The Service is currently offered as an invite-only beta. This
              Privacy Policy explains how we collect, use, and share information when
              you use the OpenFolio website and services (the &quot;Service&quot;). By using
              the Service, you agree to this policy. OpenFolio is operated by{" "}
              {companyName}.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Information we collect</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Waitlist and onboarding: your name and email address when you request
                an invite.
              </li>
              <li>
                Account information: your name, email address, profile photo, and
                unique identifiers when you create an account or sign in (including
                through Google).
              </li>
              <li>
                Workspace data: contacts, companies, interactions, notes, uploads, and
                other content you submit to the Service.
              </li>
              <li>
                Invitations: names and email addresses for people you invite to a
                workspace.
              </li>
              <li>
                Usage and device data: log data (IP address, browser type, pages
                viewed, access times) and device information.
              </li>
              <li>
                Cookies and similar technologies: session cookies and analytics
                cookies to keep you signed in and understand product usage.
              </li>
              <li>
                Support communications: information you share when you contact us for
                help or feedback.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">How we use information</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Provide, maintain, and improve the Service.</li>
              <li>Authenticate users and secure accounts.</li>
              <li>
                Send required service emails such as workspace invites, password
                resets, and important account notices.
              </li>
              <li>
                Send optional product notifications only when you opt in (no
                marketing emails at this time).
              </li>
              <li>Process waitlist and invite requests.</li>
              <li>Understand usage trends and measure performance.</li>
              <li>Protect against fraud, abuse, and security risks.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">How we share information</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We do not sell your personal information. We share information only in
              the following cases:
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Service providers: vendors that host data, send email, or provide
                analytics, background processing, or AI features for the Service,
                including Google Analytics, Vercel Analytics, Resend, and Judgment
                Labs.
              </li>
              <li>
                Legal compliance: when required to comply with law or protect the
                rights, safety, and security of OpenFolio or others.
              </li>
              <li>
                Business transfers: if we are involved in a merger, acquisition, or
                asset sale.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Google OAuth data</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you sign in with Google, we receive basic profile information such as
              your name, email address, profile photo, and a unique Google ID. We use
              this data only to create and secure your account and do not access or
              store any other Google data beyond basic profile information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">AI features</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you use AI-powered features, we process the content you submit to
              generate responses and insights. AI processing is performed by service
              providers acting on our behalf and is limited to providing and improving
              the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Analytics</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We use analytics tools (such as Google Analytics and Vercel Analytics)
              to understand usage patterns and improve the Service. These tools may
              collect data such as device identifiers, IP address, and pages visited.
              You can limit cookies through your browser settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Data retention</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We keep information as long as needed to provide the Service, comply
              with legal obligations, resolve disputes, and enforce agreements. You
              can request deletion of your account and data at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Your choices</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Access, update, or delete your account information.</li>
              <li>Control cookies through browser settings.</li>
              <li>Opt in or out of optional product notifications.</li>
              <li>Request deletion by contacting us at the email below.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              California privacy rights
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              California residents may request access to, correction of, or deletion
              of their personal information. We do not sell or share personal
              information as defined by California law. To make a request, contact
              us using the email below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Security</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We use reasonable safeguards to protect your information, but no system
              is completely secure. Please use a strong password and protect your
              account credentials.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Children</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The Service is not intended for children under 13, and we do not
              knowingly collect personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Changes</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We may update this policy from time to time. We will post the updated
              policy and revise the &quot;Last updated&quot; date above.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Contact</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Questions? Contact us at{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="text-primary underline underline-offset-4"
              >
                {contactEmail}
              </a>
              {mailingAddress && (
                <>, or write to us at:</>
              )}
            </p>
            {mailingAddress && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{companyName}</span>
              <br />
              {mailingAddress.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
            )}
          </section>
        </div>
        )}
      </main>
    </div>
  );
}
