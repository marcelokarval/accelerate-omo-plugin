import * as childProcess from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(childProcess.execFile);

export interface GitExecOptions {
  cwd?: string;
  timeout?: number;
}

export interface GitWorktreeServiceOptions {
  /**
   * Root working directory of the git repository.
   * Defaults to process.cwd() if not specified.
   */
  repoPath?: string;
  /**
   * Directory where quarantined worktrees should be placed.
   * Defaults to `<repoPath>/.worktrees-quarantine`.
   */
  quarantineDir?: string;
  /**
   * Custom runner for executing git commands (useful for testing or wrapping execution).
   */
  execRunner?: (command: string, args: string[], options: GitExecOptions) => Promise<{ stdout: string; stderr: string }>;
}

export interface CreateWorktreeOptions {
  branch: string;
  path: string;
  baseRef?: string;
  repositoryRoot?: string;
}

export interface RemoveWorktreeOptions {
  path: string;
  force?: boolean;
  repositoryRoot?: string;
}

export interface QuarantineWorktreeOptions {
  path: string;
  reason?: string;
  repositoryRoot?: string;
}

export interface WorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

export class GitWorktreeService {
  private readonly repoPath: string;
  private readonly quarantineDir: string;
  private readonly hasCustomQuarantineDir: boolean;
  private readonly execRunner: (command: string, args: string[], options: GitExecOptions) => Promise<{ stdout: string; stderr: string }>;

  constructor(options: GitWorktreeServiceOptions = {}) {
    this.repoPath = options.repoPath ? path.resolve(options.repoPath) : process.cwd();
    this.quarantineDir = options.quarantineDir
      ? path.resolve(options.quarantineDir)
      : path.join(this.repoPath, ".worktrees-quarantine");
    this.hasCustomQuarantineDir = Boolean(options.quarantineDir);
    this.execRunner = options.execRunner || (async (command, args, opts) => {
      return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        childProcess.execFile(
          command,
          args,
          { cwd: opts.cwd, timeout: opts.timeout },
          (error: childProcess.ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout: String(stdout), stderr: String(stderr) });
            }
          }
        );
      });
    });
  }

  private async git(args: string[], options: GitExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    return this.execRunner("git", args, {
      cwd: options.cwd || this.repoPath,
      timeout: options.timeout,
    });
  }

  private repositoryRoot(operationRoot?: string): string {
    return operationRoot ? path.resolve(operationRoot) : this.repoPath;
  }

  /**
   * Creates a new worktree with a new branch pointing to baseRef.
   * Runs: git worktree add -b <branch> <path> <baseRef>
   */
  async create(options: CreateWorktreeOptions): Promise<{ path: string; branch: string; baseRef: string }> {
    const { branch, baseRef = "HEAD" } = options;
    const repositoryRoot = this.repositoryRoot(options.repositoryRoot);
    const worktreePath = path.isAbsolute(options.path)
      ? options.path
      : path.resolve(repositoryRoot, options.path);

    const args = ["worktree", "add", "-b", branch, worktreePath, baseRef];
    await this.git(args, { cwd: repositoryRoot });

    return {
      path: worktreePath,
      branch,
      baseRef,
    };
  }

  /**
   * Removes a worktree cleanly.
   * Runs: git worktree remove [--force] <path>
   */
  async remove(options: RemoveWorktreeOptions): Promise<{ path: string }> {
    const repositoryRoot = this.repositoryRoot(options.repositoryRoot);
    const worktreePath = path.isAbsolute(options.path)
      ? options.path
      : path.resolve(repositoryRoot, options.path);

    const args = ["worktree", "remove"];
    if (options.force) {
      args.push("--force");
    }
    args.push(worktreePath);

    await this.git(args, { cwd: repositoryRoot });

    return { path: worktreePath };
  }

  /**
   * Quarantines a worktree directory when an agent or process times out / misbehaves,
   * preserving its state for post-mortem analysis instead of cleanly removing it.
   * Moves/renames the worktree directory into the quarantine directory and prunes worktrees.
   */
  async quarantine(options: QuarantineWorktreeOptions): Promise<{ originalPath: string; quarantinedPath: string }> {
    const repositoryRoot = this.repositoryRoot(options.repositoryRoot);
    const worktreePath = path.isAbsolute(options.path)
      ? options.path
      : path.resolve(repositoryRoot, options.path);
    const quarantineDir = this.hasCustomQuarantineDir
      ? this.quarantineDir
      : path.join(repositoryRoot, ".worktrees-quarantine");

    await fs.mkdir(quarantineDir, { recursive: true });

    const baseName = path.basename(worktreePath);
    const timestamp = Date.now();
    const sanitizedReason = options.reason ? `-${options.reason.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    const destDirName = `${baseName}-${timestamp}${sanitizedReason}`;
    const destinationPath = path.join(quarantineDir, destDirName);

    try {
      await fs.rename(worktreePath, destinationPath);
    } catch (err: any) {
      if (err?.code === "EXDEV") {
        await fs.cp(worktreePath, destinationPath, { recursive: true });
        await fs.rm(worktreePath, { recursive: true, force: true });
      } else {
        throw err;
      }
    }

    // Prune git worktree tracking references so git doesn't complain about missing worktrees
    try {
      await this.git(["worktree", "prune"], { cwd: repositoryRoot });
    } catch {
      // Best-effort prune; ignore failure if git repo is in transient state
    }

    return {
      originalPath: worktreePath,
      quarantinedPath: destinationPath,
    };
  }

  /**
   * Lists all existing worktrees via `git worktree list --porcelain`.
   */
  async list(): Promise<WorktreeEntry[]> {
    const { stdout } = await this.git(["worktree", "list", "--porcelain"]);
    const worktrees: WorktreeEntry[] = [];
    let current: Partial<WorktreeEntry> | null = null;

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (current && current.path) {
          worktrees.push(current as WorktreeEntry);
          current = null;
        }
        continue;
      }

      if (trimmed.startsWith("worktree ")) {
        if (current && current.path) {
          worktrees.push(current as WorktreeEntry);
        }
        current = { path: trimmed.slice("worktree ".length).trim() };
      } else if (trimmed.startsWith("HEAD ") && current) {
        current.head = trimmed.slice("HEAD ".length).trim();
      } else if (trimmed.startsWith("branch ") && current) {
        current.branch = trimmed.slice("branch ".length).trim();
      } else if (trimmed === "bare" && current) {
        current.bare = true;
      } else if (trimmed === "detached" && current) {
        current.detached = true;
      }
    }

    if (current && current.path) {
      worktrees.push(current as WorktreeEntry);
    }

    return worktrees;
  }

  async mergeBranch(sourceBranch: string, targetBranch: string = "master"): Promise<{ commitHash: string }> {
    await this.git(["checkout", targetBranch]);
    await this.git(["merge", "--no-ff", sourceBranch]);
    const { stdout } = await this.git(["rev-parse", "HEAD"]);
    return { commitHash: stdout.trim() };
  }

  async runVerification(targetDir: string, command: string = "npm test"): Promise<{ exitCode: number; output: string }> {
    const cwd = path.isAbsolute(targetDir)
      ? targetDir
      : path.resolve(this.repoPath, targetDir);

    try {
      const { stdout, stderr } = await this.execRunner("sh", ["-c", command], { cwd });
      return {
        exitCode: 0,
        output: `${stdout}${stderr ? "\n" + stderr : ""}`,
      };
    } catch (err: any) {
      const exitCode = typeof err.code === "number" ? err.code : 1;
      const stdout = err.stdout ? String(err.stdout) : "";
      const stderr = err.stderr ? String(err.stderr) : (err.message || "");
      const output = `${stdout}${stdout && stderr ? "\n" : ""}${stderr}`;
      return {
        exitCode,
        output,
      };
    }
  }
}

