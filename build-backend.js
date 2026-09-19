const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/db/index.ts", "src/db/schema.ts"],
  outdir: "dist/db",
  bundle: true,
  platform: "node",
  format: "cjs",
}).catch(() => process.exit(1));
