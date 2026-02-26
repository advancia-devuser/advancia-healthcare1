import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const mustExist = [
  ".github/workflows/ci-tests.yml",
  ".github/workflows/dependency-audit.yml",
  ".github/workflows/label-audit.yml",
  ".github/workflows/triage-auto-clear.yml",
  ".github/workflows/triage-reminder.yml",
  ".github/workflows/post-deploy-verify.yml",
  ".github/dependabot.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/security_report.yml",
  ".github/ISSUE_TEMPLATE/change_request.yml",
  "docs/branch-protection.md",
  "docs/repository-settings-runbook.md",
  "docs/release-readiness-checklist.md",
  "docs/release-signoff-template.md",
  "docs/label-glossary.md",
  "README.md",
];

const mustContain = [
  {
    file: "README.md",
    values: [
      "docs/branch-protection.md",
      "docs/repository-settings-runbook.md",
      "docs/release-readiness-checklist.md",
      "docs/release-signoff-template.md",
      "docs/label-glossary.md",
      ".github/workflows/dependency-audit.yml",
      ".github/workflows/label-audit.yml",
      ".github/workflows/triage-auto-clear.yml",
      ".github/workflows/triage-reminder.yml",
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
      "docs/release-signoff-template.md",
      "docs/label-glossary.md",
      ".github/workflows/ci-tests.yml",
      ".github/workflows/dependency-audit.yml",
      ".github/workflows/label-audit.yml",
      ".github/workflows/triage-auto-clear.yml",
      ".github/workflows/triage-reminder.yml",
      ".github/workflows/post-deploy-verify.yml",
      ".github/dependabot.yml",
    ],
  },
  {
    file: ".github/ISSUE_TEMPLATE/bug_report.yml",
    values: ["docs/label-glossary.md"],
  },
  {
    file: ".github/ISSUE_TEMPLATE/security_report.yml",
    values: ["docs/label-glossary.md"],
  },
  {
    file: ".github/ISSUE_TEMPLATE/change_request.yml",
    values: ["docs/label-glossary.md"],
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
