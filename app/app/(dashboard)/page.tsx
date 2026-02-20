import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStats } from "./dashboard-stats";
import { RecentInteractions } from "./recent-interactions";
import { FollowUpReminders } from "./follow-up-reminders";
import { DuplicateReview } from "@/components/duplicate-review";
import {
  Sparkles,
  ArrowRight,
  Upload,
  Search,
} from "lucide-react";

export default async function DashboardPage() {
  const mode = getRuntimeMode();
  let userName = process.env.OPENFOLIO_SELFHOST_DEFAULT_NAME || "there";

  if (mode.authMode !== "none") {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    userName = authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "there";
  }

  const firstName = String(userName).split(" ")[0];

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <header className="pt-4">
        <p className="text-sm font-medium text-primary mb-2">
          Welcome back
        </p>
        <h1 className="text-4xl font-medium tracking-tight text-foreground font-serif">
          Good to see you, {firstName}
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Your personal relationship dashboard
        </p>
      </header>

      <Card className="border-primary/20 bg-gradient-to-br from-accent to-background overflow-hidden">
        <CardContent className="p-0">
          <Link href="/app/plan" className="flex items-center justify-between p-6 group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                  Ask AI About Your Network
                </h2>
                <p className="text-muted-foreground">
                  Search your contacts, find connections, and get relationship insights
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </Link>
        </CardContent>
      </Card>

      <DashboardStats />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Interactions</CardTitle>
            </CardHeader>
            <CardContent>
              <RecentInteractions />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Follow-up Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpReminders />
            </CardContent>
          </Card>
        </div>
      </div>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <DuplicateReview />
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-medium text-foreground mb-4">Quick Actions</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link href="/app/settings/import">
            <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center shrink-0">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Import Contacts</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Upload a CSV to add people to your CRM
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/app/search">
            <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center shrink-0">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Search Network</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Find people, companies, and past interactions
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
