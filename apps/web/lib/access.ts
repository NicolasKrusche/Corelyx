/**
 * Route-level access helpers. Sit on top of lib/workspaces.ts and lib/api.ts
 * to keep API handlers terse.
 */

import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import {
  canContributeToWorkspace,
  canEdit,
  canRun,
  canView,
  getActiveWorkspace,
  getProgramAccess,
  type EffectiveProgramAccess,
  type WorkspaceRole,
} from "@/lib/workspaces";
import type { User } from "@supabase/supabase-js";

export type AuthContext = {
  user: User;
};

export type WorkspaceContext = AuthContext & {
  workspaceId: string;
  workspaceRole: WorkspaceRole;
};

export type ProgramContext = WorkspaceContext & {
  access: EffectiveProgramAccess;
};

type Failure = { error: NextResponse };

export async function requireAuth(): Promise<AuthContext | Failure> {
  const user = await getAuthUser();
  if (!user) return { error: apiError("Unauthorized", 401) };
  return { user };
}

export async function requireActiveWorkspace(): Promise<WorkspaceContext | Failure> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;

  const ws = await getActiveWorkspace(auth.user.id);
  if (!ws) return { error: apiError("No active workspace", 400) };

  return { user: auth.user, workspaceId: ws.workspaceId, workspaceRole: ws.role };
}

export async function requireWorkspaceContributor(): Promise<WorkspaceContext | Failure> {
  const ctx = await requireActiveWorkspace();
  if ("error" in ctx) return ctx;
  if (!canContributeToWorkspace(ctx.workspaceRole)) {
    return { error: apiError("Viewers cannot perform this action.", 403) };
  }
  return ctx;
}

type ProgramAccessLevel = "view" | "run" | "edit";

export async function requireProgramAccess(
  programId: string,
  level: ProgramAccessLevel
): Promise<ProgramContext | Failure> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;

  const access = await getProgramAccess(programId, auth.user.id);
  if (!access || !canView(access)) {
    return { error: apiError("Program not found", 404) };
  }
  if (level === "run" && !canRun(access)) {
    return { error: apiError("You do not have permission to run this program.", 403) };
  }
  if (level === "edit" && !canEdit(access)) {
    return { error: apiError("You do not have permission to edit this program.", 403) };
  }

  return {
    user: auth.user,
    workspaceId: access.workspaceId,
    workspaceRole: access.workspaceRole,
    access,
  };
}

export function isFailure<T>(result: T | Failure): result is Failure {
  return typeof result === "object" && result !== null && "error" in (result as Failure);
}
