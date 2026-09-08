---
name: code-structure
description: Use when creating modules, naming things, splitting large files, or reviewing code structure and performance - covers naming conventions, file and folder layout, function and class size limits, and performance budgets.
---

# Code structure

## Naming

- Choose descriptive names that reveal intent; avoid abbreviations unless universally
  understood.
- Use the domain's own terminology, consistently.
- Functions are verbs: `calculateTotal`, `validateInput`.
- Classes and types are nouns: `UserRepository`, `PaymentProcessor`.
- Booleans read as questions: `isValid`, `hasPermission`, `canEdit`.
- Constants are `UPPER_SNAKE_CASE`: `MAX_RETRIES`, `DEFAULT_TIMEOUT`.
- Files are kebab-case and match their primary export: `UserService` lives in
  `user-service.ts`. Prefer `validate-email-format.ts` over `validate.ts`.

## File and folder organization

- One class or type per file, or a small set of closely related ones.
- Group by feature or domain rather than by technical type: prefer `user/` over parallel
  `models/`, `views/`, and `controllers/` trees.
- Keep business logic, infrastructure, and presentation separate.
- Use the same directory structure across the whole project.

```
project/
├── src/
│   ├── features/          # Feature-based organization
│   │   ├── auth/
│   │   │   ├── types.ts
│   │   │   ├── service.ts
│   │   │   └── tests/
│   │   └── payments/
│   ├── shared/            # Shared utilities
│   │   ├── utils/
│   │   ├── types/
│   │   └── constants/
│   └── infrastructure/    # External concerns
│       ├── database/
│       ├── api/
│       └── logging/
├── tests/                 # Integration/E2E tests
└── docs/                  # Documentation
```

Co-locate unit tests with their source when the project follows that convention. This repo
does not: its source lives in `scripts/`, and tests live in `tests/unit/` and
`tests/integration/`.

## Module boundaries

- Draw clear boundaries and minimize cross-module dependencies.
- Communicate across modules through interfaces.
- Use explicit exports; avoid `export *`.
- Keep the public API surface small and the implementation hidden.
- Inject dependencies instead of constructing them inside the consumer.
- Never introduce a circular dependency.

## Function and class design

- One responsibility per function. 10–20 lines is ideal, 50 is the ceiling.
- Prefer pure functions; extract complex logic into separately named functions.
- A function should fit on one screen.
- Classes stay under 200–300 lines; split when they grow past that.
- Aim for high cohesion and low coupling; prefer composition over inheritance.

For UI components: keep them small and focused, define the props interface explicitly, keep
business logic out of presentation components, and put one component per file.

Design checklist:

- [ ] Function does one thing, and its name says what
- [ ] Class has a single responsibility
- [ ] Dependencies injected, not constructed
- [ ] No god objects
- [ ] Code is testable in isolation

## Language and tooling conventions in this repo

- TypeScript in strict mode, targeting ES2022, on Node.js 24+.
- Lint with ESLint flat config in `eslint.config.js`. The legacy `.eslintrc.*` format is
  dead — ESLint 10 ignores it entirely, so never add one.
- Run `npm run lint`, or `npm run lint -- --fix` to autofix. Always use the `--` separator
  when passing a flag through an npm script; `npm run lint --fix` gives the flag to npm
  instead of to ESLint.

## Performance

Optimize for the common case. Measure before optimizing — profile, do not guess — and
prefer readability over micro-optimizations.

Optimize when a user reports slowness, a performance budget is exceeded, profiling shows a
clear bottleneck, or a scalability concern is identified. Not before.

Avoid these anti-patterns:

- Loading entire datasets into memory
- N+1 query problems
- Unnecessary re-renders or recomputations
- Blocking operations in hot paths
- Premature optimization without profiling

Useful patterns: paginate large datasets, cache with an explicit TTL, pool database
connections, debounce or throttle input handlers, lazy-load images and non-critical assets,
index queried columns, minimize network round trips, and compress responses.

Budgets:

| Metric | Budget |
| --- | --- |
| Page load (LCP) | < 2.5 s |
| API response (p95) | < 200 ms |
| Incremental build | < 60 s |

Test-suite budgets live in the testing-standards skill.
