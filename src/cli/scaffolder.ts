import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScaffoldOptions, TemplateType } from './types';
import { CLI_VERSION } from './types';

export const SUPPORTED_TEMPLATES: TemplateType[] = ['nuxt-3', 'next-js', 'phaser-3'];

export function validateProjectName(name: string): { valid: boolean; reason?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, reason: 'Project name must not be empty.' };
  }

  const trimmed = name.trim();
  // Reject path traversal so the project cannot be created outside the working directory
  if (trimmed === '..' || trimmed === '.' || trimmed.includes('../') || trimmed.includes('..\\')) {
    return { valid: false, reason: 'Project name must not contain path traversal sequences.' };
  }

  // The name becomes the package.json name, so it must be a valid npm package name (optionally scoped)
  const npmPackageRegex = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!npmPackageRegex.test(trimmed)) {
    return {
      valid: false,
      reason:
        'Project name may only contain lowercase letters, digits, hyphens (-), underscores (_) and dots (.), following npm naming rules.',
    };
  }

  return { valid: true };
}

export function checkTargetDir(
  targetDir: string,
  force = false,
): { valid: boolean; reason?: string } {
  if (!fs.existsSync(targetDir)) {
    return { valid: true };
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return { valid: false, reason: `Path "${targetDir}" already exists but is not a directory.` };
  }

  const files = fs.readdirSync(targetDir);
  if (files.length > 0 && !force) {
    return {
      valid: false,
      reason: `Target directory "${targetDir}" already exists and is not empty (${files.length} entries). Choose another directory or use --force.`,
    };
  }

  return { valid: true };
}

export function resolveTemplatesDir(): string {
  // The templates folder sits at a different depth depending on how the CLI runs:
  // 1. dist/cli/index.js -> ../../templates
  // 2. src/cli/scaffolder.ts -> ../../templates
  // 3. fallback: process.cwd()/templates
  let candidate = '';
  try {
    const currentDir =
      typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
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
  replacements: Record<string, string>,
): Promise<void> {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    // File names may contain placeholders too
    let destFileName = entry.name;
    for (const [key, val] of Object.entries(replacements)) {
      destFileName = destFileName.replaceAll(key, () => val);
    }
    // Templates ship as _gitignore because npm drops files named .gitignore when publishing
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
  options: ScaffoldOptions,
): Promise<{ projectDir: string; template: TemplateType }> {
  const { projectName, targetDir, template, force } = options;

  // 1. Resolve the target directory and project name
  const resolvedTarget = path.resolve(process.cwd(), targetDir);
  let actualProjectName = projectName;
  if (
    projectName &&
    /^@[a-z0-9-*~][a-z0-9-*._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(projectName.trim())
  ) {
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

  // 2. Validate the template
  if (!SUPPORTED_TEMPLATES.includes(template)) {
    throw new Error(
      `Template "${template}" is not supported. Supported templates: ${SUPPORTED_TEMPLATES.join(', ')}`,
    );
  }

  // 3. Validate the target directory
  const dirCheck = checkTargetDir(resolvedTarget, force);
  if (!dirCheck.valid) {
    throw new Error(dirCheck.reason);
  }

  // 4. Locate the source template
  const templatesRoot = resolveTemplatesDir();
  const sourceTemplateDir = path.join(templatesRoot, template);

  if (!fs.existsSync(sourceTemplateDir)) {
    throw new Error(`Template directory not found at: ${sourceTemplateDir}`);
  }

  // 5. Copy files and substitute placeholders
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
