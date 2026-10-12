import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Tests d'integration : ils partagent une base Postgres reelle. Les faire
    // tourner en parallele provoquerait des interferences entre fichiers
    // (chaque fichier nettoie les tables). Un seul process, en serie.
    fileParallelism: false,
    pool: "forks",
    maxForks: 1,
    minForks: 1,
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Les appels reseau (bcrypt, Postgres) sont lents au premier passage.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
});
