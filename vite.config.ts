/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    base: mode === "production" ? "/fh2-area-survey-web/" : "/",
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
