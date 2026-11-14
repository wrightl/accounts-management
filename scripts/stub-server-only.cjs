/**
 * Preload for scripts that import server modules outside Next: makes
 * `import "server-only"` a no-op. (The `react-server` export condition would
 * do the same but also swaps React for its server build, which @react-pdf
 * cannot render with.)
 */
const path = require.resolve("server-only");
require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
