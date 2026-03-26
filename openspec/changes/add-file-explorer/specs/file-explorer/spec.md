## ADDED Requirements

### Requirement: User can browse space files
The system SHALL allow users to browse files and directories within the current space through a file tree interface.

#### Scenario: Display root directory on load
- **WHEN** user opens a space with FileExplorer visible
- **THEN** system displays the root directory contents with folders first, then files, sorted alphabetically

#### Scenario: Expand directory
- **WHEN** user clicks on a directory item
- **THEN** system expands the directory to show its contents
- **AND** directory icon changes to indicate expanded state

#### Scenario: Collapse directory
- **WHEN** user clicks on an expanded directory
- **THEN** system collapses the directory and hides its contents
- **AND** directory icon changes to indicate collapsed state

### Requirement: File icons display correctly
The system SHALL display appropriate icons for files based on their extensions.

#### Scenario: Display folder icon
- **WHEN** a directory is displayed in the file tree
- **THEN** system shows a folder icon (closed or open based on expansion state)

#### Scenario: Display file type icon
- **WHEN** a file is displayed in the file tree
- **THEN** system shows an icon matching its file type (e.g., code icon for .ts, document icon for .md)

#### Scenario: Display default icon for unknown types
- **WHEN** a file with unknown extension is displayed
- **THEN** system shows a default file icon

### Requirement: User can open files in ContentCanvas
The system SHALL open selected files in the ContentCanvas with appropriate viewer.

#### Scenario: Open code file
- **WHEN** user clicks on a code file (.ts, .js, .py, etc.)
- **THEN** system opens the file in ContentCanvas using CodeViewer with syntax highlighting

#### Scenario: Open markdown file
- **WHEN** user clicks on a markdown file (.md)
- **THEN** system opens the file in ContentCanvas using MarkdownViewer with rendered content

#### Scenario: Open image file
- **WHEN** user clicks on an image file (.png, .jpg, .svg)
- **THEN** system opens the file in ContentCanvas using ImageViewer

#### Scenario: Open JSON file
- **WHEN** user clicks on a JSON file (.json)
- **THEN** system opens the file in ContentCanvas using JsonViewer

#### Scenario: Handle unsupported file type
- **WHEN** user clicks on an unsupported file type (e.g., .exe, .bin)
- **THEN** system shows an error message indicating the file type cannot be previewed

### Requirement: File APIs validate path boundaries
The system SHALL validate that all file paths are within the space directory to prevent path traversal attacks.

#### Scenario: Block path traversal attempt
- **WHEN** client requests a path containing `..` or other traversal patterns (e.g., `../../etc/passwd`)
- **THEN** system returns 403 error with message "Access denied: path outside space directory"

#### Scenario: Allow valid paths
- **WHEN** client requests a valid path within the space directory
- **THEN** system processes the request normally

### Requirement: File content API returns text content
The system SHALL provide an API endpoint to retrieve file text content for frontend display.

#### Scenario: Get file content successfully
- **WHEN** client requests GET /api/v1/spaces/:spaceId/files/:path/content
- **THEN** system returns file content as text with metadata (mimeType, size, language, isBinary)

#### Scenario: Handle file not found
- **WHEN** client requests a non-existent file path
- **THEN** system returns 404 error with appropriate message

#### Scenario: Handle file too large
- **WHEN** client requests a file larger than 1MB
- **THEN** system returns 413 error indicating file is too large for preview

#### Scenario: Handle binary file
- **WHEN** client requests a binary file (image, etc.)
- **THEN** system returns `isBinary: true` with mimeType for frontend to handle

### Requirement: File type detection API returns file metadata
The system SHALL provide an API endpoint to detect file type without returning content.

#### Scenario: Detect file type successfully
- **WHEN** client requests GET /api/v1/spaces/:spaceId/files/:path/detect-type
- **THEN** system returns file type, mimeType, and language (if applicable)

#### Scenario: Handle unknown file type
- **WHEN** client requests a file with unknown extension
- **THEN** system returns type "unknown" with detected mimeType

### Requirement: FileExplorer integrates with SpacePage layout
The system SHALL display FileExplorer as a right sidebar in SpacePage.

#### Scenario: Show FileExplorer on desktop
- **WHEN** user views SpacePage on desktop (based on `useIsMobile()` hook)
- **THEN** system displays FileExplorer as a fixed-width (240px) sidebar on the right

#### Scenario: Hide FileExplorer on mobile
- **WHEN** user views SpacePage on mobile (based on `useIsMobile()` hook)
- **THEN** system hides FileExplorer (accessible via floating button)

#### Scenario: FileExplorer collapsible
- **WHEN** user clicks the collapse button
- **THEN** system collapses FileExplorer to a minimal width showing only icons
