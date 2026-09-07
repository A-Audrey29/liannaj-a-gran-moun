import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  // "pg" volontairement absent : bundlé et minifié, le driver casse à la
  // connexion (ERR_INVALID_ARG_TYPE dans addCString au startup du protocole).
  // Il est chargé depuis node_modules, comme @prisma/client et son adaptateur.
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  // Format ESM et non CJS : le client Prisma 7 généré fait
  //   globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
  // et `import.meta` n'existe pas en CJS. esbuild le remplaçait alors par un
  // objet vide, donc `import.meta.url` valait undefined et le serveur crashait
  // au démarrage sur ERR_INVALID_ARG_TYPE — le bundle CJS n'a jamais pu booter.
  //
  // package.json déclare déjà "type": "module", donc un .js est traité en ESM.
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    // En ESM, esbuild ne fournit pas les globales CJS. Plusieurs dépendances
    // bundlées (dont pg et express) appellent require() ou lisent __dirname :
    // on les recrée à partir de import.meta.url.
    banner: {
      js: [
        `import { createRequire as __createRequire } from "node:module";`,
        `import { fileURLToPath as __fileURLToPath } from "node:url";`,
        `import { dirname as __pathDirname } from "node:path";`,
        `const require = __createRequire(import.meta.url);`,
        `const __filename = __fileURLToPath(import.meta.url);`,
        `const __dirname = __pathDirname(__filename);`,
      ].join("\n"),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
