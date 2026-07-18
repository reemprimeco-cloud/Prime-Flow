// Vitest runs under plain Node, not Next.js's bundler, so the real
// "server-only" package (which unconditionally throws to catch accidental
// client bundling) would fail every test that imports a module using it.
// Aliased in via vitest.config.ts instead of the real package.
export {};
