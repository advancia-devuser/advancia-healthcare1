---
applyTo: "README.md,.env.example,docs/**/*.md,.github/workflows/**/*.yml"
---

For `advancia-healthcare1`, preserve a strict infrastructure boundary from the canonical `modullar-advancia` production stack.

Rules:
- Treat this repository as a separate smart-wallet app unless the user explicitly asks to merge or retire it.
- Do not suggest or introduce configuration that points this repo at the canonical `modullar-advancia` production Supabase/Auth/Postgres project.
- Keep `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, Vercel project settings, and GitHub Actions secrets scoped to this repository's own environment.
- If the goal is to reduce confusion or duplicate infrastructure, recommend consolidating features into `modullar-advancia` rather than having both repos share one production data project.