# AGENTS.md

This file defines project-specific guidance for coding agents (including Codex) working in this repository.

## Project Snapshot
- App: `openthumbnail`
- Stack: TanStack Start, React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4
- Package manager/runtime: Bun (lockfile: `bun.lock`)
- Source root: `src/`

## Primary Goal
- Keep changes small, clear, and safe.
- Favor maintainability over cleverness.
- Preserve existing architectural patterns unless a task explicitly asks for refactors.

## Workflow
1. Read relevant files before editing.
2. Make the smallest change that fully solves the task.
3. Run targeted checks for touched areas.
4. Commit in small, logical chunks using Conventional Commits.

## Commands
- Install deps: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build`
- Test: `bun run test`
- Lint: `bun run lint`
- Format: `bun run format --write .`
- Full local cleanup/check pass: `bun run check`

## Editing Rules
- Use TypeScript with explicit, readable types where it helps clarity.
- Avoid broad rewrites unless requested.
- Reuse existing utilities/components before adding new abstractions.
- Keep UI changes consistent with existing component patterns in `src/components`.
- Keep imports and file organization aligned with current project style.

## Testing Expectations
- For logic changes: run `bun run test`.
- For lint-sensitive changes: run `bun run lint`.
- For formatting-sensitive changes: run `bun run check` or at least format touched files.
- If full checks are too heavy for a small change, run the most relevant subset and report what was run.

## Commit Guidelines
- Use Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.).
- Keep commits focused to one logical change.
- Commit message format: `<type>(<scope>): <short imperative summary>`
- Examples:
  - `docs(agent): add project AGENTS.md guidance`
  - `fix(workshop): guard empty asset export`
  - `refactor(ui): simplify modal footer actions`

## Safety
- Never commit secrets or credentials.
- Do not run destructive git commands unless explicitly requested.
- If unexpected unrelated workspace changes appear, pause and ask before proceeding.

