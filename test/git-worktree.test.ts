import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import * as childProcess from "node:child_process";
import { GitWorktreeService } from "../src/git-worktree.js";

vi.mock("node:fs/promises");
vi.mock("node:child_process");

describe("GitWorktreeService", () => {
  const repoPath = "/mock/repo";
  const quarantineDir = "/mock/repo/.custom-quarantine";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should run git worktree add -b <branch> <path> <baseRef> with defaults", async () => {
      const execRunner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
      const service = new GitWorktreeService({ repoPath, execRunner });

      const result = await service.create({
        branch: "feature-123",
        path: ".worktrees/feature-123",
      });

      const expectedPath = path.resolve(repoPath, ".worktrees/feature-123");
      expect(result).toEqual({
        branch: "feature-123",
        path: expectedPath,
        baseRef: "HEAD",
      });

      expect(execRunner).toHaveBeenCalledTimes(1);
      expect(execRunner).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-b", "feature-123", expectedPath, "HEAD"],
        { cwd: repoPath, timeout: undefined }
      );
    });

    it("should use custom baseRef and absolute path correctly", async () => {
      const execRunner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
      const service = new GitWorktreeService({ repoPath, execRunner });

      const targetPath = "/absolute/worktree/path";
      const result = await service.create({
        branch: "feature-custom",
        path: targetPath,
        baseRef: "origin/main",
      });

      expect(result).toEqual({
        branch: "feature-custom",
        path: targetPath,
        baseRef: "origin/main",
      });

      expect(execRunner).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-b", "feature-custom", targetPath, "origin/main"],
        { cwd: repoPath, timeout: undefined }
      );
    });

    it("should throw if git execution fails", async () => {
      const execRunner = vi.fn().mockRejectedValue(new Error("fatal: branch already exists"));
      const service = new GitWorktreeService({ repoPath, execRunner });

      await expect(
        service.create({
          branch: "already-exists",
          path: ".worktrees/fail",
        })
      ).rejects.toThrow("fatal: branch already exists");
    });
  });

  describe("remove", () => {
    it("should run git worktree remove <path>", async () => {
      const execRunner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
      const service = new GitWorktreeService({ repoPath, execRunner });

      const targetPath = path.resolve(repoPath, ".worktrees/feature-1");
      const result = await service.remove({ path: ".worktrees/feature-1" });

      expect(result).toEqual({ path: targetPath });
      expect(execRunner).toHaveBeenCalledWith(
        "git",
        ["worktree", "remove", targetPath],
        { cwd: repoPath, timeout: undefined }
      );
    });

    it("should run git worktree remove --force <path> when force=true", async () => {
      const execRunner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
      const service = new GitWorktreeService({ repoPath, execRunner });

      const targetPath = "/abs/path/worktree";
      const result = await service.remove({ path: targetPath, force: true });

      expect(result).toEqual({ path: targetPath });
      expect(execRunner).toHaveBeenCalledWith(
        "git",
        ["worktree", "remove", "--force", targetPath],
        { cwd: repoPath, timeout: undefined }
      );
    });
  });

  describe("quarantine", () => {
    it("should move/rename worktree directory into quarantine directory and prune", async () => {
      const execRunner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
      const service = new GitWorktreeService({ repoPath, quarantineDir, execRunner });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.rename).mockResolvedValue(undefined as any);

      vi.spyOn(Date, "now").mockReturnValue(1700000000000);

      const worktreeRelative = ".worktrees/timeout-job";
      const expectedOriginal = path.resolve(repoPath, worktreeRelative);

      const result = await service.quarantine({
        path: worktreeRelative,
        reason: "process-timeout",
      });

      expect(fs.mkdir).toHaveBeenCalledWith(quarantineDir, { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith(
        expectedOriginal,
        path.join(quarantineDir, "timeout-job-1700000000000-process-timeout")
      );
      expect(execRunner).toHaveBeenCalledWith("git", ["worktree", "prune"], {
        cwd: repoPath,
        timeout: undefined,
      });

      expect(result).toEqual({
        originalPath: expectedOriginal,
        quarantinedPath: path.join(quarantineDir, "timeout-job-1700000000000-process-timeout"),
      });
    });

    it("should handle quarantine without reason and ignore git prune errors gracefully", async () => {
      const execRunner = vi.fn().mockRejectedValue(new Error("git prune failed"));
      const service = new GitWorktreeService({ repoPath, execRunner });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.rename).mockResolvedValue(undefined as any);
      vi.spyOn(Date, "now").mockReturnValue(1700000000000);

      const absPath = "/other/path/worker-1";
      const defaultQuarantine = path.join(repoPath, ".worktrees-quarantine");

      const result = await service.quarantine({ path: absPath });

      expect(fs.mkdir).toHaveBeenCalledWith(defaultQuarantine, { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith(
        absPath,
        path.join(defaultQuarantine, "worker-1-1700000000000")
      );
      expect(result.quarantinedPath).toBe(path.join(defaultQuarantine, "worker-1-1700000000000"));
    });
  });

  describe("list", () => {
    it("should parse git worktree list --porcelain output correctly", async () => {
      const stdout = [
        "worktree /mock/repo",
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/master",
        "",
        "worktree /mock/repo/.worktrees/worker-1",
        "HEAD 2222222222222222222222222222222222222222",
        "branch refs/heads/worker-branch",
        "",
        "worktree /mock/repo/.worktrees/detached-one",
        "HEAD 3333333333333333333333333333333333333333",
        "detached",
        "",
        "worktree /mock/repo/.worktrees/bare-one",
        "bare",
      ].join("\n");

      const execRunner = vi.fn().mockResolvedValue({ stdout, stderr: "" });
      const service = new GitWorktreeService({ repoPath, execRunner });

      const worktrees = await service.list();

      expect(worktrees).toEqual([
        {
          path: "/mock/repo",
          head: "1111111111111111111111111111111111111111",
          branch: "refs/heads/master",
        },
        {
          path: "/mock/repo/.worktrees/worker-1",
          head: "2222222222222222222222222222222222222222",
          branch: "refs/heads/worker-branch",
        },
        {
          path: "/mock/repo/.worktrees/detached-one",
          head: "3333333333333333333333333333333333333333",
          detached: true,
        },
        {
          path: "/mock/repo/.worktrees/bare-one",
          bare: true,
        },
      ]);
    });
  });

  describe("default execRunner with mocked child_process.execFile", () => {
    it("should call child_process.execFile when no custom execRunner is provided", async () => {
      const execFileMock = vi.mocked(childProcess.execFile);
      execFileMock.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, callback: any) => {
          const cb = typeof _opts === "function" ? _opts : callback;
          if (cb) cb(null, "output", "");
          return {} as any;
        }) as any
      );

      const service = new GitWorktreeService({ repoPath });
      await service.remove({ path: "temp-path" });

      expect(execFileMock).toHaveBeenCalled();
    });
  });
});
