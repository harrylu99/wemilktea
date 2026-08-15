# WeMilktea V1 engineering instructions

Read this file and the relevant document in `docs/` before significant implementation. Approved Figma designs are the UI source of truth; reuse their approved tokens and components rather than recreating visual systems.

## Architecture and ownership

- `apps/web` owns public discovery UI and its presentation-only modules.
- `apps/admin` owns internal operational UI and its presentation-only modules.
- `packages/domain`, `packages/validation`, and `packages/config` own only shared contracts. Do not add UI here.
- `supabase/migrations` owns database schema history. Database changes are migration-driven.
- `supabase/functions` owns server-side integrations and privileged workflows.
- Share code only when it has two real consumers. Do not create placeholder shared packages or abstractions.
- The approved stack is Bun workspaces, React, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui, Zod, Supabase, Cloudflare Workers Static Assets/R2, and Google Places. Do not replace it without a technical blocker.
- No general-purpose Node/Fastify API is part of V1. Secret-bearing work belongs in Supabase Edge Functions or another approved server-side boundary.

## Code conventions

- Use strict TypeScript. Avoid `any`; when unavoidable, isolate and justify it.
- Prefer small named modules and direct data flow. Keep app-specific UI inside its app.
- Validate untrusted inputs at the boundary with Zod. Treat database data and third-party API responses as untrusted.
- Add generated shadcn/ui components to the consuming app unless the component has two established consumers.
- Follow the existing formatter and linter. Do not refactor unrelated code.

## Database and data

- Model geographic values with PostGIS where geographic queries require them.
- Every schema, policy, index, function, or extension change must be a reviewed SQL migration in `supabase/migrations`.
- Enable and test RLS for exposed tables. Public reads must be limited to published data; admin mutations require an authenticated authorized role.
- Never store image binaries in PostgreSQL. Store WeMilktea-owned/permitted image objects in Cloudflare R2 and only object keys/metadata in the database.
- Google Places supports discovery and enrichment; it does not canonically own WeMilktea store data. Follow its storage, attribution, and usage requirements.

## Security

- Never expose a Supabase service-role key, Google Places key, or R2 credential in browser code, committed files, or Vite environment variables.
- Use only publishable/anon Supabase credentials in either browser app.
- Keep privileged integrations server-side and validate inputs before privileged actions.

## Quality

- Write focused tests for behavior, validators, and data transformations. Run lint, test, typecheck, and build before handoff when dependencies are available.
- Meet WCAG-aware basics: semantic HTML, keyboard operation, visible focus, labels, error messaging, and sufficient contrast.
- Build responsive layouts from narrow screens upward; verify public and admin layouts at mobile and desktop widths.
- When implementing Figma, inspect the approved design first, reuse approved tokens/components, implement the relevant screen faithfully, then compare target breakpoints before calling it complete.

## V1 scope

- Keep work within the approved public discovery flows and internal operations portal described in `docs/PRD.md`.
- Do not add hypothetical V2 features, generalized infrastructure, or speculative automation.
- Create a reusable custom AI skill only after its workflow has been exercised and is demonstrably repeated; this document and the repository docs are the initial working agreement.
