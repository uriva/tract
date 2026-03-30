"use client";

import Link from "next/link";
import db from "@/lib/instant";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = db.useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-6 h-14">
          <Link
            href="/app"
            className="text-base font-semibold tracking-tight hover:opacity-70 transition-opacity"
          >
            tract
          </Link>

          <div className="flex items-center gap-2">
            <a href="mailto:uri.valevski@gmail.com?subject=Tract%20Support">
              <Button variant="ghost" size="sm" className="text-sm font-normal text-muted-foreground">
                Support
              </Button>
            </a>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="text-sm font-normal text-muted-foreground" />
                }
              >
                {user?.email}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => db.auth.signOut()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto w-full px-6 py-8 page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
