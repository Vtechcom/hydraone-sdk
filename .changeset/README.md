# Changesets

This folder holds pending release notes managed by [Changesets](https://github.com/changesets/changesets).

Add one for every user-visible change:

```bash
pnpm run changeset
```

Choose the bump type (while the version is below 1.0.0, breaking changes are a minor bump) and write a short English summary. Commit the generated file with your pull request. On merge to `main`, the release workflow opens a "version packages" pull request that updates `package.json` and `CHANGELOG.md`; merging that pull request publishes to npm.
