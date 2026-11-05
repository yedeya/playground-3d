# Stack

The project's stack document (`K-LAYOUT-17`), started by `kanon init`. The sections it leaves out mean their documented defaults: no schema changes, nothing to isolate, no generated files, and the whole repository as code, with a JavaScript or TypeScript test being a `*.test.*` or `*.spec.*` file that nothing runs until `## Code areas` names its tree and runner.

## Gates

1. `npm test`
2. `npm run build`

## Code areas

- `src/` — code: the speeltoestel viewer app
- `tests/` `vitest` — tests: unit tests of the model data and the part helpers
