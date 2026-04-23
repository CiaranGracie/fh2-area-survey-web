/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    base: process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || "/",
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
