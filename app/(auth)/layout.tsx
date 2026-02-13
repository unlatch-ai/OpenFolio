import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/5 via-accent to-background p-12 flex-col justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image
              src="/brand/logo-mark.png"
              alt="OpenFolio logo"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              OpenFolio
            </span>
          </Link>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-serif font-medium tracking-tight text-foreground leading-tight">
            Your personal relationship memory
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Import your contacts, sync communications, and use AI to understand
            and manage your professional network.
          </p>
          <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Contact import</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Semantic search</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          AI-powered personal CRM for professionals
        </p>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image
              src="/brand/logo-mark.png"
              alt="OpenFolio logo"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              OpenFolio
            </span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Your personal relationship memory
          </p>
        </div>

        <div className="w-full max-w-sm">
          {children}
        </div>

        <p className="mt-8 text-xs text-muted-foreground text-center max-w-sm">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
