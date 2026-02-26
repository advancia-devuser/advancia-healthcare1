import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const mustExist = [
  ".github/workflows/ci-tests.yml",
  ".github/workflows/dependency-audit.yml",
  ".github/workflows/post-deploy-verify.yml",
  ".github/dependabot.yml",
  "docs/branch-protection.md",
  "docs/repository-settings-runbook.md",
  "docs/release-readiness-checklist.md",
  "README.md",
];

const mustContain = [
  {
    file: "README.md",
    values: [
      "docs/branch-protection.md",
      "docs/repository-settings-runbook.md",
      "docs/release-readiness-checklist.md",
      ".github/workflows/dependency-audit.yml",
      ".github/dependabot.yml",
    ],
  },
  {
    file: "docs/branch-protection.md",
    values: ["docs/repository-settings-runbook.md"],
  },
  {
    file: "docs/repository-settings-runbook.md",
    values: [
      "docs/branch-protection.md",
      "docs/release-readiness-checklist.md",
      ".github/workflows/ci-tests.yml",
      ".github/workflows/dependency-audit.yml",
      ".github/workflows/post-deploy-verify.yml",
      ".github/dependabot.yml",
    ],
  },
];

const errors = [];

for (const relPath of mustExist) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) {
    errors.push(`Missing required file: ${relPath}`);
  }
}

for (const check of mustContain) {
  const absPath = path.join(root, check.file);
  if (!fs.existsSync(absPath)) {
    errors.push(`Cannot verify content, file missing: ${check.file}`);
    continue;
  }

  const content = fs.readFileSync(absPath, "utf8");
  for (const value of check.values) {
    if (!content.includes(value)) {
      errors.push(`Missing reference '${value}' in ${check.file}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Documentation/workflow consistency check failed:\n");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Documentation/workflow consistency check passed.");
