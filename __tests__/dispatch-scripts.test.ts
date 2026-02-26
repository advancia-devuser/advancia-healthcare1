import { spawnSync } from "child_process";
import path from "path";

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

describe("Dispatch helper scripts (dry-run)", () => {
  const repoRoot = process.cwd();
  const bashScript = path.join(repoRoot, "scripts", "trigger-post-deploy-verify.sh");
  const psScript = path.join(repoRoot, "scripts", "trigger-post-deploy-verify.ps1");

  // Note:
  // - Bash script assertions run in Linux/macOS environments.
  // - On Windows, bash test is skipped to avoid shell-path false negatives;
  //   PowerShell path remains covered locally.

  test("bash helper prints dry-run preview with defaults", () => {
    if (process.platform === "win32") {
      console.warn("Skipping bash script test on Windows environment");
      return;
    }

    if (!commandAvailable("bash")) {
      console.warn("Skipping bash script test: 'bash' is not available");
      return;
    }

    const result = spawnSync(
      "bash",
      [bashScript, "advancia-devuser", "advancia-healthcare1", "post_deploy_verify", "--dry-run"],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run] Repository dispatch preview");
    expect(result.stdout).toContain("https://api.github.com/repos/advancia-devuser/advancia-healthcare1/dispatches");
    expect(result.stdout).toContain('{"event_type":"post_deploy_verify"}');
  });

  test("pwsh helper prints dry-run preview with defaults", () => {
    if (!commandAvailable("pwsh")) {
      console.warn("Skipping PowerShell script test: 'pwsh' is not available");
      return;
    }

    const result = spawnSync("pwsh", ["-File", psScript, "-DryRun"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run] Repository dispatch preview");
    expect(result.stdout).toContain("https://api.github.com/repos/advancia-devuser/advancia-healthcare1/dispatches");
    expect(result.stdout).toContain('{"event_type":"post_deploy_verify"}');
  });
});
