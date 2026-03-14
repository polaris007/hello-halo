/**
 * Shared App Spec Types
 *
 * Pure TypeScript type definitions for the App Spec system.
 * These types are used by both the main process and the renderer process.
 *
 * IMPORTANT: This file must NOT import any Node.js or Electron APIs.
 * It is included in the renderer (web) tsconfig.
 *
 * All types here are manually mirrored from the Zod-derived types in
 * src/main/apps/spec/schema.ts. They must be kept in sync. When the Zod
 * schema changes, update these types accordingly.
 *
 * Why manual mirror instead of re-export?
 * - The renderer tsconfig does not include src/main/
 * - Importing from src/main/ would pull in Node.js types
 * - Zod schemas (runtime code) should not be bundled into the renderer
 */
export {};
//# sourceMappingURL=spec-types.js.map