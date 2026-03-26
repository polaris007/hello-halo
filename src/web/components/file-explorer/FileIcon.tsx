/**
 * FileIcon - File and folder icon component with extension-based icons
 *
 * Features:
 * - Folder icons (open/closed states)
 * - Extension-based file icons
 * - Lucide icons for consistent styling
 */

import {
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  Folder,
  FolderOpen,
  FileType
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Map file extensions to icons
const EXTENSION_ICONS: Record<string, LucideIcon> = {
  // Code files
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  cs: FileCode,
  swift: FileCode,
  kt: FileCode,
  rb: FileCode,
  php: FileCode,
  vue: FileCode,
  svelte: FileCode,

  // Config/Data files
  json: FileJson,
  yaml: FileText,
  yml: FileText,
  toml: FileText,
  xml: FileText,

  // Documentation
  md: FileText,
  markdown: FileText,
  txt: FileText,

  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,

  // Web
  html: FileCode,
  css: FileCode,
  scss: FileCode,
  less: FileCode,
}

// Map extensions to colors
const EXTENSION_COLORS: Record<string, string> = {
  // TypeScript
  ts: 'text-blue-400',
  tsx: 'text-blue-400',
  // JavaScript
  js: 'text-yellow-400',
  jsx: 'text-yellow-400',
  mjs: 'text-yellow-400',
  // Python
  py: 'text-green-400',
  // Rust
  rs: 'text-orange-400',
  // Go
  go: 'text-cyan-400',
  // Ruby
  rb: 'text-red-400',
  // PHP
  php: 'text-purple-400',
  // Java
  java: 'text-red-400',
  // C/C++
  c: 'text-blue-400',
  cpp: 'text-blue-400',
  h: 'text-purple-400',
  // C#
  cs: 'text-purple-400',
  // Swift
  swift: 'text-orange-400',
  // Kotlin
  kt: 'text-purple-400',
  // Vue
  vue: 'text-green-400',
  // Svelte
  svelte: 'text-orange-400',
  // JSON
  json: 'text-yellow-400',
  // YAML
  yaml: 'text-red-400',
  yml: 'text-red-400',
  // Markdown
  md: 'text-blue-300',
  markdown: 'text-blue-300',
  // HTML
  html: 'text-orange-400',
  // CSS
  css: 'text-blue-400',
  scss: 'text-pink-400',
  less: 'text-blue-400',
  // Images
  png: 'text-green-400',
  jpg: 'text-green-400',
  jpeg: 'text-green-400',
  gif: 'text-green-400',
  svg: 'text-yellow-400',
  webp: 'text-green-400',
}

export interface FileIconProps {
  /** File name with extension */
  name: string
  /** Whether the item is a directory */
  isDirectory: boolean
  /** Whether a directory is expanded (only for directories) */
  isExpanded?: boolean
  /** Icon size */
  size?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Get the appropriate icon component for a file
 */
function getFileIcon(name: string, isDirectory: boolean, isExpanded: boolean): LucideIcon {
  if (isDirectory) {
    return isExpanded ? FolderOpen : Folder
  }

  const ext = name.split('.').pop()?.toLowerCase() || ''
  return EXTENSION_ICONS[ext] || File
}

/**
 * Get the color class for a file icon
 */
function getFileColor(name: string, isDirectory: boolean): string {
  if (isDirectory) {
    return 'text-amber-400'
  }

  const ext = name.split('.').pop()?.toLowerCase() || ''
  return EXTENSION_COLORS[ext] || 'text-muted-foreground'
}

export function FileIcon({
  name,
  isDirectory,
  isExpanded = false,
  size = 16,
  className = ''
}: FileIconProps) {
  const Icon = getFileIcon(name, isDirectory, isExpanded)
  const colorClass = getFileColor(name, isDirectory)

  return (
    <Icon
      size={size}
      className={`${colorClass} flex-shrink-0 ${className}`}
    />
  )
}
