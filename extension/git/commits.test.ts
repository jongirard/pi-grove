import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkStream } from "../lib/types.js";

vi.mock("./git.js", () => ({
  isGitRepo: vi.fn(),
  getCurrentBranch: vi.fn(),
  createBranch: vi.fn(),
  checkoutBranch: vi.fn(),
  stageAll: vi.fn(),
  commit: vi.fn(),
  hasUncommittedChanges: vi.fn(),
}));

import * as git from "./git.js";
import { GroveGitManager } from "./commits.js";

const mockGit = git as {
  isGitRepo: ReturnType<typeof vi.fn>;
  getCurrentBranch: ReturnType<typeof vi.fn>;
  createBranch: ReturnType<typeof vi.fn>;
  checkoutBranch: ReturnType<typeof vi.fn>;
  stageAll: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  hasUncommittedChanges: ReturnType<typeof vi.fn>;
};

const makeWorkStream = (overrides: Partial<WorkStream> = {}): WorkStream => ({
  id: "2A",
  name: "Shared Types",
  phase: 1,
  dependencies: [],
  brief: "Create shared type definitions",
  filesToCreate: ["lib/types.ts"],
  doneWhen: "Types compile",
  status: "done",
  ...overrides,
});

describe("GroveGitManager", () => {
  let manager: GroveGitManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new GroveGitManager("/test/project");
  });

  describe("onWorkStreamDone", () => {
    it("commits with plan name, workstream name, phase, and brief", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(true);
      mockGit.stageAll.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue("abc1234");

      await manager.onWorkStreamDone(makeWorkStream(), "ADR-003: Capture Pipeline");

      expect(mockGit.commit).toHaveBeenCalledWith(
        "/test/project",
        "ADR-003: Capture Pipeline — Shared Types, Phase 1\n\nCreate shared type definitions",
      );
    });

    it("falls back to simple format without plan name", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(true);
      mockGit.stageAll.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue("abc1234");

      await manager.onWorkStreamDone(makeWorkStream());

      expect(mockGit.commit).toHaveBeenCalledWith(
        "/test/project",
        "Shared Types — complete\n\nCreate shared type definitions",
      );
    });

    it("returns commit hash on success", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(true);
      mockGit.stageAll.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue("abc1234");

      const hash = await manager.onWorkStreamDone(makeWorkStream(), "Test Plan");
      expect(hash).toBe("abc1234");
    });

    it("returns null when not a git repo", async () => {
      mockGit.isGitRepo.mockResolvedValue(false);

      const result = await manager.onWorkStreamDone(makeWorkStream());
      expect(result).toBeNull();
      expect(mockGit.commit).not.toHaveBeenCalled();
    });

    it("returns null when no uncommitted changes", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(false);

      const result = await manager.onWorkStreamDone(makeWorkStream());
      expect(result).toBeNull();
      expect(mockGit.stageAll).not.toHaveBeenCalled();
    });

    it("uses workstream cwd when set (absolute path)", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(true);
      mockGit.stageAll.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue("def5678");

      const ws = makeWorkStream({ cwd: "/other/repo" });
      await manager.onWorkStreamDone(ws, "Test Plan");

      expect(mockGit.isGitRepo).toHaveBeenCalledWith("/other/repo");
      expect(mockGit.stageAll).toHaveBeenCalledWith("/other/repo");
      expect(mockGit.commit).toHaveBeenCalledWith("/other/repo", expect.any(String));
    });

    it("resolves relative cwd against projectRoot", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(true);
      mockGit.stageAll.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue("def5678");

      const ws = makeWorkStream({ cwd: "../sibling-repo" });
      await manager.onWorkStreamDone(ws, "Test Plan");

      // /test/project + ../sibling-repo = /test/sibling-repo
      expect(mockGit.isGitRepo).toHaveBeenCalledWith("/test/sibling-repo");
    });

    it("returns null on git command error", async () => {
      mockGit.isGitRepo.mockResolvedValue(true);
      mockGit.hasUncommittedChanges.mockResolvedValue(true);
      mockGit.stageAll.mockRejectedValue(new Error("git failed"));

      const result = await manager.onWorkStreamDone(makeWorkStream());
      expect(result).toBeNull();
    });
  });

  describe("prepareBranchForSlot", () => {
    it("creates and checks out correct branch name", async () => {
      mockGit.createBranch.mockResolvedValue(undefined);
      mockGit.checkoutBranch.mockResolvedValue(undefined);

      await manager.prepareBranchForSlot(1);

      expect(mockGit.createBranch).toHaveBeenCalledWith("/test/project", "grove/t1");
      expect(mockGit.checkoutBranch).toHaveBeenCalledWith("/test/project", "grove/t1");
    });
  });

  describe("branchMode", () => {
    it("defaults to false", () => {
      expect(manager.getBranchMode()).toBe(false);
    });

    it("toggles correctly", () => {
      manager.setBranchMode(true);
      expect(manager.getBranchMode()).toBe(true);

      manager.setBranchMode(false);
      expect(manager.getBranchMode()).toBe(false);
    });
  });
});
