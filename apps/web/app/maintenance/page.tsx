import type { Metadata } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { readSystemFlags, DEFAULT_MAINTENANCE_MESSAGE } from "@/lib/system-flags";
import { getMaintenanceArea } from "@/lib/maintenance-areas";
import { MaintenanceAutoRecover } from "./maintenance-auto-recover";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Under maintenance",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const { area } = await searchParams;
  const flags = await readSystemFlags();
  const areaDef = area ? getMaintenanceArea(area) : undefined;

  const title = areaDef ? `${areaDef.label} is under maintenance` : "We'll be right back";
  const message = areaDef
    ? `${areaDef.description} This part of Corelyx is temporarily unavailable — please try again shortly.`
    : flags.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
          <Wrench className="h-8 w-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-3 text-gray-600">{message}</p>
        <MaintenanceAutoRecover area={area} />
        {/* Discreet escape hatch for admins/testers: /login is maintenance-exempt,
            and an admin who signs in bypasses the gate (isMaintenanceBypassAdmin).
            This is the only way in from the desktop app, which has no address bar.
            The desktop window loads a fixed URL with no way to type /login. */}
        <p className="mt-8 text-sm">
          <Link
            href="/login"
            className="text-gray-400 underline-offset-4 transition hover:text-gray-600 hover:underline"
          >
            Team sign-in
          </Link>
        </p>
        <p className="mt-2 text-sm text-gray-400">Corelyx</p>
      </div>
    </main>
  );
}
