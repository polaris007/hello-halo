#!/usr/bin/env node
/**
 * Fix OpenAI Compat Router Imports
 *
 * 修复 openai-compat-router 目录下的目录导入问题
 * 将 './types.js' 改为 './types/index.js' 等
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.join(__dirname, '..', 'src', 'server', 'services', 'agent', 'openai-compat-router');

// 需要修复的目录导入映射
const DIR_IMPORTS = {
  // ../../ 路径（从 converters/request/ 或 converters/response/）
  "'../../types.js'": "'../../types/index.js'",
  '"../../types.js"': '"../../types/index.js"',
  "'../../utils.js'": "'../../utils/index.js'",
  '"../../utils.js"': '"../../utils/index.js"',
  "'../../converters.js'": "'../../converters/index.js'",
  '"../../converters.js"': '"../../converters/index.js"',
  "'../../stream.js'": "'../../stream/index.js'",
  '"../../stream.js"': '"../../stream/index.js"',
  "'../../interceptors.js'": "'../../interceptors/index.js'",
  '"../../interceptors.js"': '"../../interceptors/index.js"',
  "'../../server.js'": "'../../server/index.js'",
  '"../../server.js"': '"../../server/index.js"',
  // ../ 路径
  "'../types.js'": "'../types/index.js'",
  '"../types.js"': '"../types/index.js"',
  "'../utils.js'": "'../utils/index.js'",
  '"../utils.js"': '"../utils/index.js"',
  "'../converters.js'": "'../converters/index.js'",
  '"../converters.js"': '"../converters/index.js"',
  "'../stream.js'": "'../stream/index.js'",
  '"../stream.js"': '"../stream/index.js"',
  "'../interceptors.js'": "'../interceptors/index.js'",
  '"../interceptors.js"': '"../interceptors/index.js"',
  "'../server.js'": "'../server/index.js'",
  '"../server.js"': '"../server/index.js"',
  // ./ 路径
  "'./types.js'": "'./types/index.js'",
  '"./types.js"': '"./types/index.js"',
  "'./utils.js'": "'./utils/index.js'",
  '"./utils.js"': '"./utils/index.js"',
};

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const [oldImport, newImport] of Object.entries(DIR_IMPORTS)) {
    if (content.includes(oldImport)) {
      content = content.split(oldImport).join(newImport);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  return false;
}

function findTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (item === 'node_modules') continue;
      findTsFiles(fullPath, files);
    } else if (stat.isFile() && item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  console.log('🔧 Fixing OpenAI Compat Router Imports\n');

  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`❌ Error: Directory not found: ${TARGET_DIR}`);
    process.exit(1);
  }

  const files = findTsFiles(TARGET_DIR);
  console.log(`Found ${files.length} TypeScript files\n`);

  let fixedCount = 0;
  for (const file of files) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\n✅ Done! Fixed ${fixedCount} files.`);
}

main();
