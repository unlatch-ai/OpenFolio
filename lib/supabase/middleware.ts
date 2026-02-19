import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRuntimeMode } from "@/lib/runtime-mode";

export async function updateSession(request: NextRequest) {
  const mode = getRuntimeMode();
  if (process.env.E2E_BYPASS_AUTH === "1" && process.env.NODE_ENV !== "production") {
    return NextResponse.next({ request });
  }

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = pathname === "/app" || pathname.startsWith("/app/");
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/invite";

  if (mode.authMode === "none") {
    if (pathname === "/" && mode.deploymentMode === "self-hosted") {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }

    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }

    if (isProtectedRoute) {
      return NextResponse.next({ request });
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define auth routes (login, signup)
  const isLoginOrSignupRoute = pathname === "/login" || pathname === "/signup";

  // Onboarding is a special route - authenticated users without orgs need access
  const isOnboardingRoute = pathname === "/onboarding";

  // Redirect unauthenticated users trying to access protected routes to login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users hitting the marketing root to the app
  if (user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages to app
  // But allow onboarding page
  if (user && isLoginOrSignupRoute && !isOnboardingRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  // Redirect unauthenticated users trying to access onboarding to login
  if (!user && isOnboardingRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
