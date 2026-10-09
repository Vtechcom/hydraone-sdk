English | [Tiếng Việt](./CONTRIBUTING.vi.md)

# Contributing

Thanks for helping improve `@hydraone/sdk`. This guide covers setup, conventions and the pull request process. By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Set up

You need Node.js 22 (see `.nvmrc`; the package supports Node 20 and later) and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/Vtechcom/hydraone-sdk.git
cd hydraone-sdk
pnpm install
```

The repository is a pnpm workspace: the root package is the SDK and `templates/*` are the project templates used by the CLI.

## Scripts

| Script                   | What it does                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `pnpm run build`         | Build ESM, CJS and type declarations into `dist/` with tsup. |
| `pnpm run clean`         | Remove `dist/`.                                              |
| `pnpm run lint`          | Run ESLint.                                                  |
| `pnpm run format`        | Format with Prettier. `format:check` only verifies.          |
| `pnpm run typecheck`     | Run `tsc --noEmit` (sources and tests).                      |
| `pnpm test`              | Run the Vitest suite. `test:watch` for watch mode.           |
| `pnpm run test:coverage` | Run the suite with V8 coverage.                              |
| `pnpm run docs`          | Generate the TypeDoc API reference into `docs/api/`.         |
| `pnpm run size`          | Check bundle size limits (run after `build`).                |
| `pnpm run changeset`     | Add a changeset describing your change.                      |

Package checks, as CI runs them (after `build`):

```bash
pnpm exec publint
pnpm exec attw --pack . --profile node16
```

Before opening a pull request, run at least: `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` and `pnpm test`.

## Code conventions

- TypeScript in strict mode. Avoid `any`; use `unknown` and narrow it.
- Everything in the code is English: identifiers, comments, TSDoc, log and error messages.
- Comments explain why, not what. Do not leave commented-out code or untracked TODOs.
- Every exported symbol needs TSDoc (`@param`, `@returns`, `@throws`, and an `@example` for non-trivial APIs).
- Errors must be `HydraBridgeError` (or a subclass) with a stable `code` from `ERROR_CODES`. Never put tokens, signatures or other secrets in messages or logs.
- Keep zero runtime dependencies. Adding one needs a strong justification in the pull request.
- Add or update tests with every behavior change. Fix the bug first with a failing test.
- Keep public API changes deliberate: removing or renaming an export is a breaking change.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, in English and in the imperative mood.

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`. Append `!` (for example `refactor(react)!:`) and add a `BREAKING CHANGE:` footer for breaking changes.

## Changesets

User-visible changes need a changeset so the version and the CHANGELOG are updated at release:

```bash
pnpm run changeset
```

Pick the package, the bump type (while below 1.0.0, breaking changes are a minor bump), and write a one-line English summary.

## Documentation

The English files are the source of truth. The Vietnamese translations (`*.vi.md`, `docs/vi/`) must mirror the English structure one to one. When you change an English page, update its Vietnamese counterpart in the same pull request, or say in the pull request that the translation is pending. Keep code, commands, API names and error codes in English in both. Code examples must compile against the real API.

## Pull requests

1. Fork and branch from `main`. Name the branch `type/short-description`.
2. Make focused changes, one purpose per pull request.
3. Make sure lint, typecheck, build and tests pass, and that coverage does not drop.
4. Fill in the pull request template, link the issue, and describe how you tested.
5. A maintainer reviews. Address comments with new commits; they are squashed on merge.

## Reporting problems

- Bugs and ideas: [GitHub issues](https://github.com/Vtechcom/hydraone-sdk/issues).
- Vulnerabilities: follow [SECURITY.md](./SECURITY.md). Do not file public issues.

## License

By contributing you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE).
