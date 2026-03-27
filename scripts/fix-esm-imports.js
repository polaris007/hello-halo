/**
 * ESM Import Path Fixer
 * 
 * This script fixes all relative import paths in TypeScript files to include .js extension
 * for ESM compatibility.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, extname, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_DIR = join(__dirname, '..', 'src', 'server');

/**
 * Recursively get all .ts files in a directory
 */
function getTsFiles(dir, files = []) {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      getTsFiles(fullPath, files);
    } else if (extname(item) === '.ts') {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Fix import paths in a file
 */
function fixImportsInFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Match import statements with relative paths (not starting with @)
  // Pattern: from './path' or from '../path'
  const importRegex = /from\s+['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]/g;
  
  content = content.replace(importRegex, (match, importPath) => {
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    // Skip if has other extensions (.css, .json, etc.)
    if (/\.[^/]+$/.test(importPath)) {
      return match;
    }
    
    // Add .js extension
    modified = true;
    return match.replace(importPath, importPath + '.js');
  });
  
  // Match dynamic imports
  const dynamicImportRegex = /import\(['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]\)/g;
  
  content = content.replace(dynamicImportRegex, (match, importPath) => {
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    // Skip if has other extensions
    if (/\.[^/]+$/.test(importPath)) {
      return match;
    }
    
    // Add .js extension
    modified = true;
    return match.replace(importPath, importPath + '.js');
  });
  
  if (modified) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed: ${relative(process.cwd(), filePath)}`);
    return true;
  }
  
  return false;
}

// Main
console.log('🔧 Fixing ESM import paths...\n');

const files = getTsFiles(SERVER_DIR);
let fixedCount = 0;

for (const file of files) {
  if (fixImportsInFile(file)) {
    fixedCount++;
  }
}

console.log(`\n✅ Done! Fixed ${fixedCount} files.`);
