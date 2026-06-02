import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminUsersClient } from "./admin-users-client";

export const metadata = { title: "Users — Admin" };

export default async function AdminUsersPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/dashboard?error=admin_required");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Users</h2>
        <p className="text-sm text-muted-foreground mt-1">Search accounts and manage bans.</p>
      </div>
      <AdminUsersClient currentUserId={user.id} />
    </div>
  );
}
