## 1. Backend - File Content API

- [ ] 1.1 Add GET /api/v1/spaces/:spaceId/files/:path/content endpoint in files.routes.ts
- [ ] 1.2 Implement file size check (reject files > 1MB with 413 error)
- [ ] 1.3 Add mimeType detection based on file extension
- [ ] 1.4 Add language detection for code files
- [ ] 1.5 Handle binary files (return mimeType without content for images)

## 2. Frontend - API Client

- [ ] 2.1 Add fetchFileContent API method in src/web/api/client.ts
- [ ] 2.2 Add TypeScript types for FileContentResponse

## 3. Frontend - FileExplorer Components

- [ ] 3.1 Create src/web/components/file-explorer/ directory
- [ ] 3.2 Create FileIcon.tsx - file/folder icon component with extension-based icons
- [ ] 3.3 Create FileTree.tsx - recursive tree component with expand/collapse
- [ ] 3.4 Create useFileExplorer.ts - custom hook for state management (currentPath, expandedDirs, files)
- [ ] 3.5 Create FileExplorer.tsx - main container with header, tree, and collapse functionality

## 4. Frontend - Canvas Integration

- [ ] 4.1 Wire FileExplorer to existing canvasLifecycle.openFile() method
- [ ] 4.2 Handle unsupported file types with error toast

## 5. Frontend - Layout Integration

- [ ] 5.1 Add FileExplorer to SpacePage.tsx layout (right sidebar)
- [ ] 5.2 Implement responsive behavior (hide on mobile, show floating button)
- [ ] 5.3 Add collapse/expand functionality for FileExplorer
- [ ] 5.4 Update layout styles for three-column layout (Chat | Canvas | FileExplorer)

## 6. Testing & Polish

- [ ] 6.1 Test file browsing on different directory structures
- [ ] 6.2 Test file opening with different types (code, markdown, image, json)
- [ ] 6.3 Test large file handling (should show error)
- [ ] 6.4 Test mobile responsive layout
- [ ] 6.5 Run npm run i18n to extract translations
