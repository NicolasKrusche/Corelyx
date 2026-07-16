import { redirect } from "next/navigation";

// Costs & Billing merged into /admin/finances so all money data lives on one
// page. Kept as a redirect for bookmarks and in-flight links; /admin/finances
// shows the cost half to everyone with hasCostsAccess and gates revenue,
// margin, and top-users behind hasFounderAccess.
export default function CostsPage() {
  redirect("/admin/finances");
}
