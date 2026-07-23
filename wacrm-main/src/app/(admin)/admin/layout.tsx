import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { UnauthorizedError } from "@/lib/auth/account";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Guards the whole (admin) route group server-side. Deliberately its own
// group rather than reusing DashboardShell — this is a platform-operator
// area, not part of any single client's CRM, so it doesn't need the
// account sidebar/header chrome.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePlatformAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/login");
    }
    // Authenticated but not a platform admin — send them back to their
    // own app rather than showing a bare 403.
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
