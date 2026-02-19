import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getRuntimeMode } from "@/lib/runtime-mode";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern use of OpenFolio.",
  alternates: {
    canonical: "/terms",
  },
};

const isSelfHosted = getRuntimeMode().deploymentMode === "self-hosted";

const lastUpdated = "February 13, 2026";
const contactEmail = isSelfHosted ? null : "me@kevinfang.tech";
const companyName = isSelfHosted ? null : "Fang Labs LLC";
const mailingAddress = isSelfHosted ? null : ["2108 B ST", "STE N", "SACRAMENTO, CA 95816"];

export default function TermsOfServicePage() {
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
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
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
            Terms of Service
          </p>
          <h1 className="text-4xl font-serif font-semibold text-foreground">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        {isSelfHosted ? (
          <div className="mt-10 space-y-10">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">Self-hosted instance</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This is a self-hosted instance of OpenFolio. The software is provided
                &quot;as is&quot; and &quot;as available&quot; without warranty of any kind, express or
                implied, including but not limited to warranties of merchantability,
                fitness for a particular purpose, and non-infringement.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The operator of this instance is solely responsible for compliance with
                applicable laws, data protection regulations, and any terms they choose
                to establish for their users. The authors and contributors of OpenFolio
                shall not be liable for any claim, damages, or other liability arising
                from the use of this software.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                OpenFolio is licensed under the MIT License. Source code is available at{" "}
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
            <h2 className="text-xl font-semibold text-foreground">Acceptance</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of the
              OpenFolio website and services (the &quot;Service&quot;). By using the Service,
              you agree to these Terms and our Privacy Policy. OpenFolio is operated
              by {companyName}.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Eligibility</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The Service is intended for users in the United States and is not
              directed to children under 13. If you are using the Service on behalf
              of an organization, you represent that you are authorized to bind that
              organization to these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Invite-only beta</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              OpenFolio is currently offered as an invite-only beta. We may change,
              suspend, or discontinue the Service (or any part of it) at any time, and
              we do not guarantee that the Service will be available or error free.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Accounts</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                You are responsible for the activity on your account and for
                maintaining the confidentiality of your credentials.
              </li>
              <li>
                You must provide accurate information and keep it up to date.
              </li>
              <li>
                You may not share or transfer your account except as permitted by
                your organization.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Your content</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You retain ownership of the content you submit to the Service. You grant
              OpenFolio a limited license to host, store, process, and display your
              content solely to provide and improve the Service.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You represent that you have the rights and permissions needed to submit
              your content (including contact data) and that your content complies
              with applicable laws and regulations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Service ownership</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              OpenFolio and its licensors own the Service, including all software,
              designs, and branding. We grant you a limited, non-exclusive,
              non-transferable license to use the Service in accordance with these
              Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Feedback</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you provide feedback or suggestions, you grant OpenFolio a
              non-exclusive, worldwide, royalty-free license to use and incorporate
              that feedback without restriction or compensation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Acceptable use</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Do not violate any law or regulation.</li>
              <li>Do not attempt to gain unauthorized access to the Service.</li>
              <li>Do not interfere with or disrupt the Service or its users.</li>
              <li>Do not upload malware or engage in abusive behavior.</li>
              <li>
                Do not reverse engineer, copy, or resell the Service except as
                permitted by law.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Email and notifications</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We send required service emails such as workspace invites, password
              resets, and account notifications. Optional product notifications will
              be sent only if you opt in.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Third-party services</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The Service may integrate with third-party services such as Google for
              authentication. Your use of third-party services is subject to their
              terms and policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Paid plans</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The Service is currently offered without paid subscriptions. If we
              introduce paid plans, we will update these Terms and provide notice
              before any charges apply.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Suspension and termination</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We may suspend or terminate your access to the Service if you violate
              these Terms, use the Service in a way that could cause harm, or if we
              discontinue the Service. You may stop using the Service at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Disclaimers</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the
              maximum extent permitted by law, OpenFolio disclaims all warranties,
              express or implied, including warranties of merchantability, fitness
              for a particular purpose, and non-infringement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Limitation of liability</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              To the maximum extent permitted by law, OpenFolio will not be liable
              for any indirect, incidental, special, consequential, or punitive
              damages, or any loss of profits, data, or goodwill. OpenFolio&apos;s total
              liability for any claim will not exceed $100 or the amount you paid us
              in the 12 months before the claim, whichever is greater.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Indemnification</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You agree to indemnify and hold OpenFolio harmless from claims,
              damages, losses, and expenses arising out of your use of the Service or
              your violation of these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Governing law</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              These Terms are governed by the laws of the State of California,
              without regard to conflict of law principles. Any disputes will be
              resolved in the state or federal courts located in San Francisco
              County, California.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Changes</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We may update these Terms from time to time. We will post the updated
              Terms and revise the &quot;Last updated&quot; date above.
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
