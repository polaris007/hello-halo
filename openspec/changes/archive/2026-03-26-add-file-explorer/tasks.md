## 1. Backend - Security Fix

- [x] 1.1 Add `validatePathBoundary()` helper function in files.routes.ts
- [x] 1.2 Apply path validation to existing upload endpoint (POST /spaces/:spaceId/files)
- [x] 1.3 Apply path validation to existing download endpoint (GET regex route)
- [x] 1.4 Apply path validation to existing list endpoint (GET /spaces/:spaceId/files)
- [x] 1.5 Add unit tests for path boundary validation

## 2. Backend - New API Endpoints

- [x] 2.1 Add `GET /spaces/:spaceId/files/:path/content` endpoint (place BEFORE regex route)
- [x] 2.2 Implement file size check (reject files > 2MB with 413 error)
- [x] 2.3 Add mimeType detection based on file extension
- [x] 2.4 Add language detection for code files
- [x] 2.5 Handle binary files (return isBinary: true without content)
- [x] 2.6 Add `GET /spaces/:spaceId/files/:path/detect-type` endpoint
- [x] 2.7 Add unit tests for new endpoints

## 3. Frontend - API Client Updates

- [x] 3.1 Update `readArtifactContent` to `readFileContent(spaceId, path)` in src/web/api/index.ts
- [x] 3.2 Update `detectFileType` to accept spaceId parameter
- [x] 3.3 Add TypeScript types for FileContentResponse and FileTypeResponse
- [x] 3.4 Update canvas-lifecycle.ts to pass spaceId to API calls

## 4. Frontend - FileExplorer Components

- [x] 4.1 Create src/web/components/file-explorer/ directory
- [x] 4.2 Create FileIcon.tsx - file/folder icon component with extension-based icons
- [x] 4.3 Create FileTree.tsx - recursive tree component with expand/collapse
- [x] 4.4 Create useFileExplorer.ts - custom hook for state management (currentPath, expandedDirs, files)
- [x] 4.5 Create FileExplorer.tsx - main container with header, tree, and collapse functionality

## 5. Frontend - Canvas Integration

- [x] 5.1 Wire FileExplorer to existing canvasLifecycle.openFile() method
- [x] 5.2 Handle unsupported file types with error toast

## 6. Frontend - Layout Integration

- [x] 6.1 Add FileExplorer to SpacePage.tsx layout (right sidebar)
- [x] 6.2 Use `useIsMobile()` hook for responsive behavior (not hardcoded breakpoint)
- [x] 6.3 Add collapse/expand functionality for FileExplorer
- [x] 6.4 Update layout styles for three-column layout (Chat | Canvas | FileExplorer)

## 7. Testing & Polish

- [x] 7.1 Test path traversal security fix (verify `../` is blocked)
- [x] 7.2 Test file browsing on different directory structures
- [x] 7.3 Test file opening with different types (code, markdown, image, json)
- [x] 7.4 Test large file handling (should show error)
- [x] 7.5 Test mobile responsive layout
- [x] 7.6 Run npm run i18n to extract translations
