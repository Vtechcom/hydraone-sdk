import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScaffoldOptions, TemplateType } from './types';
import { CLI_VERSION } from './types';

export const SUPPORTED_TEMPLATES: TemplateType[] = ['nuxt-3', 'next-js', 'phaser-3'];

export function validateProjectName(name: string): { valid: boolean; reason?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, reason: 'Tên dự án không được để trống.' };
  }

  const trimmed = name.trim();
  // Không cho phép path traversal
  if (trimmed === '..' || trimmed === '.' || trimmed.includes('../') || trimmed.includes('..\\')) {
    return { valid: false, reason: 'Tên dự án không được chứa ký tự điều hướng thư mục (path traversal).' };
  }

  // Regex hợp lệ cho npm package name (có thể có scope @org/pkg hoặc tên thông thường)
  const npmPackageRegex = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!npmPackageRegex.test(trimmed)) {
    return {
      valid: false,
      reason: 'Tên dự án chỉ được chứa chữ cái thường, số, dấu gạch ngang (-), gạch dưới (_) hoặc dấu chấm (.), tuân thủ chuẩn npm.',
    };
  }

  return { valid: true };
}

export function checkTargetDir(
  targetDir: string,
  force = false
): { valid: boolean; reason?: string } {
  if (!fs.existsSync(targetDir)) {
    return { valid: true };
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return { valid: false, reason: `Đường dẫn "${targetDir}" đã tồn tại nhưng không phải là thư mục.` };
  }

  const files = fs.readdirSync(targetDir);
  if (files.length > 0 && !force) {
    return {
      valid: false,
      reason: `Thư mục đích "${targetDir}" đã tồn tại và không rỗng (${files.length} tệp/thư mục). Vui lòng chọn thư mục khác hoặc sử dụng --force.`,
    };
  }

  return { valid: true };
}

export function resolveTemplatesDir(): string {
  // Tìm kiếm templates/ ở các vị trí có thể có:
  // 1. Khi chạy từ dist/cli/index.js -> ../../templates
  // 2. Khi chạy từ src/cli/scaffolder.ts -> ../../templates
  // 3. Fallback: process.cwd()/templates
  let candidate = '';
  try {
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
    candidate = path.resolve(currentDir, '../../templates');
    if (fs.existsSync(candidate)) return candidate;

    candidate = path.resolve(currentDir, '../templates');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // Ignore error
  }

  const cwdCandidate = path.resolve(process.cwd(), 'templates');
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }

  return candidate;
}

export async function copyTemplateDir(
  sourceDir: string,
  targetDir: string,
  replacements: Record<string, string>
): Promise<void> {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    // Thay thế tên file nếu có token
    let destFileName = entry.name;
    for (const [key, val] of Object.entries(replacements)) {
      destFileName = destFileName.replaceAll(key, () => val);
    }
    // Chuyển _gitignore thành .gitignore để tránh npm tự đổi tên khi publish package
    if (destFileName === '_gitignore') {
      destFileName = '.gitignore';
    }
    const destPath = path.join(targetDir, destFileName);

    if (entry.isDirectory()) {
      await copyTemplateDir(srcPath, destPath, replacements);
    } else if (entry.isFile()) {
      const isBinary = /\.(png|jpe?g|gif|webp|ico|wasm|mp3|wav|ogg|bin|zip)$/i.test(entry.name);
      if (isBinary) {
        fs.copyFileSync(srcPath, destPath);
      } else {
        let content = fs.readFileSync(srcPath, 'utf-8');
        for (const [key, val] of Object.entries(replacements)) {
          content = content.replaceAll(key, () => val);
        }
        fs.writeFileSync(destPath, content, 'utf-8');
      }
    }
  }
}

export async function scaffoldProject(
  options: ScaffoldOptions
): Promise<{ projectDir: string; template: TemplateType }> {
  const { projectName, targetDir, template, force } = options;

  // 1. Kiểm tra thư mục đích và tên dự án
  const resolvedTarget = path.resolve(process.cwd(), targetDir);
  let actualProjectName = projectName;
  if (projectName && /^@[a-z0-9-*~][a-z0-9-*._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(projectName.trim())) {
    actualProjectName = projectName.trim();
  } else if (projectName && (projectName.includes('/') || projectName.includes('\\'))) {
    actualProjectName = path.basename(resolvedTarget);
  } else if (!projectName) {
    actualProjectName = path.basename(resolvedTarget);
  }

  const nameValidation = validateProjectName(actualProjectName);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.reason);
  }

  // 2. Kiểm tra template được hỗ trợ
  if (!SUPPORTED_TEMPLATES.includes(template)) {
    throw new Error(
      `Template "${template}" không được hỗ trợ. Các template hỗ trợ gồm: ${SUPPORTED_TEMPLATES.join(', ')}`
    );
  }

  // 3. Kiểm tra thư mục đích
  const dirCheck = checkTargetDir(resolvedTarget, force);
  if (!dirCheck.valid) {
    throw new Error(dirCheck.reason);
  }

  // 4. Tìm thư mục template nguồn
  const templatesRoot = resolveTemplatesDir();
  const sourceTemplateDir = path.join(templatesRoot, template);

  if (!fs.existsSync(sourceTemplateDir)) {
    throw new Error(`Không tìm thấy thư mục template tại: ${sourceTemplateDir}`);
  }

  // 5. Sao chép và thay thế placeholder
  const replacements: Record<string, string> = {
    '{{PROJECT_NAME}}': actualProjectName,
    '{{SDK_VERSION}}': `^${CLI_VERSION}`,
    '@hydraone/template-nuxt-3': actualProjectName,
    '@hydraone/template-next-js': actualProjectName,
    '@hydraone/template-phaser-3': actualProjectName,
    'workspace:*': `^${CLI_VERSION}`,
  };

  await copyTemplateDir(sourceTemplateDir, resolvedTarget, replacements);

  return {
    projectDir: resolvedTarget,
    template,
  };
}
