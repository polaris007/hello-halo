#!/usr/bin/env node
/**
 * Fix Path Aliases
 *
 * 将编译后的 JavaScript 文件中的 @shared 路径别名替换为相对路径
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', 'dist');

// 匹配 import 语句中的 @shared 路径
const IMPORT_REGEX = /from\s+(['"])@shared\/([^'"]+)\1/g;

function getRelativePath(fromFile, toPath) {
  // 计算从 fromFile 所在目录到 toPath 的相对路径
  const fromDir = path.dirname(fromFile);
  const relativePath = path.relative(fromDir, toPath);
  // 确保路径以 ./ 开头
  return relativePath.startsWith('.') ? relativePath : './' + relativePath;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 替换所有 @shared 导入
  content = content.replace(IMPORT_REGEX, (match, quote, importPath) => {
    modified = true;
    // 目标路径在 dist/shared 下
    const targetPath = path.join(DIST_DIR, 'shared', importPath);
    const relativePath = getRelativePath(filePath, targetPath);
    // 添加 .js 扩展名（如果还没有）
    const pathWithExt = relativePath.endsWith('.js') ? relativePath : relativePath + '.js';
    return `from ${quote}${pathWithExt}${quote}`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  return false;
}

function findJsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (item === 'node_modules') continue;
      findJsFiles(fullPath, files);
    } else if (stat.isFile() && item.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  console.log('🔧 Fixing Path Aliases\n');

  if (!fs.existsSync(DIST_DIR)) {
    console.error(`❌ Error: Directory not found: ${DIST_DIR}`);
    console.error('   Please run "npm run build:server" first.');
    process.exit(1);
  }

  const files = findJsFiles(path.join(DIST_DIR, 'server'));
  console.log(`Found ${files.length} JavaScript files\n`);

  let fixedCount = 0;
  for (const file of files) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\n✅ Done! Fixed ${fixedCount} files.`);
}

main();
