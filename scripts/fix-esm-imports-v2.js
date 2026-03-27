#!/usr/bin/env node
/**
 * ESM Import Fixer v2 - 修复 TypeScript 文件中的 ESM 导入路径
 *
 * 这个脚本会：
 * 1. 为相对路径导入添加 .js 扩展名
 * 2. 对于导入目录的情况（如 './utils'），改为 './utils/index.js'
 * 3. 正确处理已有的 .js 扩展名
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src', 'server');

// 需要跳过的导入模式
const SKIP_PATTERNS = [
  /^node:/,           // node: 内置模块
  /^@shared\//,       // @shared 路径别名
  /^@shared$/,        // @shared 路径别名
  /^\./,              // 相对路径（我们会单独处理）
  /^[^./]/,           // npm 包（非相对路径）
];

// 检查是否是目录导入（即导入的是一个文件夹，应该指向 index.js）
function isDirectoryImport(importPath, currentFile) {
  // 如果已经有扩展名，不是目录导入
  if (path.extname(importPath)) {
    return false;
  }

  // 解析完整路径
  const currentDir = path.dirname(currentFile);
  const resolvedPath = path.resolve(currentDir, importPath);

  // 检查是否存在对应目录
  try {
    const stats = fs.statSync(resolvedPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// 修复单个文件中的导入
function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 匹配 import 语句 - 支持多行导入
  const importRegex = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const replacements = [];
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const originalImport = match[1] || match[2];
    const fullMatch = match[0];

    // 跳过非相对路径的导入
    if (!originalImport.startsWith('.')) {
      continue;
    }

    // 跳过已经有 .js 扩展名的导入
    if (originalImport.endsWith('.js')) {
      continue;
    }

    // 跳过 .css、.json 等已知扩展名
    if (/\.(css|json|svg|png|jpg|jpeg|gif|woff|woff2|ttf|eot)$/.test(originalImport)) {
      continue;
    }

    // 检查是否是目录导入
    const isDir = isDirectoryImport(originalImport, filePath);

    let newImport;
    if (isDir) {
      // 目录导入 -> 指向 index.js
      newImport = `${originalImport}/index.js`;
    } else {
      // 文件导入 -> 添加 .js
      newImport = `${originalImport}.js`;
    }

    replacements.push({
      original: fullMatch,
      updated: fullMatch.replace(originalImport, newImport),
      originalImport,
      newImport
    });
  }

  // 应用替换（从后往前替换以避免位置变化）
  for (const { original, updated } of replacements.reverse()) {
    content = content.replace(original, updated);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed: ${path.relative(process.cwd(), filePath)}`);
    return { fixed: true, count: replacements.length };
  }

  return { fixed: false, count: 0 };
}

// 递归查找所有 .ts 文件
function findTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 跳过 __tests__ 目录（测试文件不需要修复）
      if (item === '__tests__' || item === 'node_modules') {
        continue;
      }
      findTsFiles(fullPath, files);
    } else if (stat.isFile() && item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

// 主函数
function main() {
  console.log('🔧 ESM Import Fixer v2\n');
  console.log(`Scanning: ${SRC_DIR}\n`);

  if (!fs.existsSync(SRC_DIR)) {
    console.error(`❌ Error: Directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const files = findTsFiles(SRC_DIR);
  console.log(`Found ${files.length} TypeScript files\n`);

  let totalFixed = 0;
  let totalFiles = 0;

  for (const file of files) {
    const result = fixImportsInFile(file);
    if (result.fixed) {
      totalFixed += result.count;
      totalFiles++;
    }
  }

  console.log(`\n✅ Done! Fixed ${totalFixed} imports in ${totalFiles} files.`);
}

main();
