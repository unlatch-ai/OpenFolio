"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LogoutButton } from "./logout-button";
import { navItems } from "./nav-items";

interface MobileNavProps {
  userName: string;
  userEmail: string;
  userInitials: string;
}

export function MobileNav({ userName, userEmail, userInitials }: MobileNavProps) {
  return (
    <div className="md:hidden border-b border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <div className="flex flex-col h-full">
              <div className="p-5 pb-4 border-b border-border">
                <Link href="/app" className="flex items-center gap-2.5 group mb-3">
                  <div className="w-8 h-8 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                    <Image
                      src="/brand/logo-mark.png"
                      alt="OpenFolio logo"
                      width={32}
                      height={32}
                      className="h-8 w-8"
                    />
                  </div>
                  <span className="text-lg font-semibold tracking-tight text-foreground">
                    OpenFolio
                  </span>
                </Link>
                <WorkspaceSwitcher />
              </div>

              <nav className="flex-1 px-3 py-2">
                <div className="space-y-0.5">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <Link
                    href="/app/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span>Settings</span>
                  </Link>
                </div>
              </nav>

              <div className="p-3 border-t border-border">
                <div className="flex items-center gap-3 px-2 py-2">
                  <Avatar className="h-8 w-8 ring-1 ring-border">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs font-medium">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <LogoutButton />
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/app" className="flex items-center gap-2">
          <Image
            src="/brand/logo-mark.png"
            alt="OpenFolio logo"
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <span className="text-base font-semibold tracking-tight text-foreground">
            OpenFolio
          </span>
        </Link>

        <div className="w-9" />
      </div>
    </div>
  );
}
