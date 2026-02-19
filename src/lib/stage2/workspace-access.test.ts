import { WorkspaceRole } from "@prisma/client";
import {
  canAssignInviteRole,
  canManageWorkspace,
  canUpdateMemberRole,
  resolveRoleOnInviteAccept,
} from "@/lib/stage2/workspace-access";
import { describe, expect, it } from "vitest";

describe("canManageWorkspace", () => {
  it("allows owners and admins", () => {
    expect(canManageWorkspace(WorkspaceRole.OWNER)).toBe(true);
    expect(canManageWorkspace(WorkspaceRole.ADMIN)).toBe(true);
  });

  it("denies members and viewers", () => {
    expect(canManageWorkspace(WorkspaceRole.MEMBER)).toBe(false);
    expect(canManageWorkspace(WorkspaceRole.VIEWER)).toBe(false);
  });
});

describe("canAssignInviteRole", () => {
  it("owner can assign admin/member/viewer but not owner", () => {
    expect(canAssignInviteRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)).toBe(true);
    expect(canAssignInviteRole(WorkspaceRole.OWNER, WorkspaceRole.MEMBER)).toBe(true);
    expect(canAssignInviteRole(WorkspaceRole.OWNER, WorkspaceRole.VIEWER)).toBe(true);
    expect(canAssignInviteRole(WorkspaceRole.OWNER, WorkspaceRole.OWNER)).toBe(false);
  });

  it("admin can only assign member or viewer", () => {
    expect(canAssignInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN)).toBe(false);
    expect(canAssignInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)).toBe(false);
    expect(canAssignInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)).toBe(true);
    expect(canAssignInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.VIEWER)).toBe(true);
  });
});

describe("resolveRoleOnInviteAccept", () => {
  it("keeps stronger existing role", () => {
    expect(resolveRoleOnInviteAccept(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)).toBe(
      WorkspaceRole.ADMIN,
    );
  });

  it("upgrades weaker existing role", () => {
    expect(resolveRoleOnInviteAccept(WorkspaceRole.VIEWER, WorkspaceRole.MEMBER)).toBe(
      WorkspaceRole.MEMBER,
    );
  });

  it("uses invite role when no existing role", () => {
    expect(resolveRoleOnInviteAccept(null, WorkspaceRole.VIEWER)).toBe(WorkspaceRole.VIEWER);
  });
});

describe("canUpdateMemberRole", () => {
  it("lets owner update non-owner roles", () => {
    expect(
      canUpdateMemberRole(WorkspaceRole.OWNER, WorkspaceRole.MEMBER, WorkspaceRole.ADMIN),
    ).toBe(true);
    expect(
      canUpdateMemberRole(WorkspaceRole.OWNER, WorkspaceRole.VIEWER, WorkspaceRole.MEMBER),
    ).toBe(true);
  });

  it("prevents owner transfer through generic role update", () => {
    expect(
      canUpdateMemberRole(WorkspaceRole.OWNER, WorkspaceRole.MEMBER, WorkspaceRole.OWNER),
    ).toBe(false);
    expect(
      canUpdateMemberRole(WorkspaceRole.OWNER, WorkspaceRole.OWNER, WorkspaceRole.ADMIN),
    ).toBe(false);
  });

  it("limits admin to member/viewer changes", () => {
    expect(
      canUpdateMemberRole(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER),
    ).toBe(true);
    expect(
      canUpdateMemberRole(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.ADMIN),
    ).toBe(false);
    expect(
      canUpdateMemberRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER, WorkspaceRole.MEMBER),
    ).toBe(false);
  });
});
