import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import {
  validateProjectName,
  checkTargetDir,
  scaffoldProject,
  copyTemplateDir,
  SUPPORTED_TEMPLATES,
} from '../../src/cli/scaffolder';
import { parseCliArgs, CLI_VERSION } from '../../src/cli/index';

describe('create-hydraone-game CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-cli-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Project Name Validation (validateProjectName)', () => {
    it('accepts valid npm-style project names', () => {
      expect(validateProjectName('my-game').valid).toBe(true);
      expect(validateProjectName('cardano_quest').valid).toBe(true);
      expect(validateProjectName('hydra-game-2026').valid).toBe(true);
      expect(validateProjectName('@hydra/my-starter').valid).toBe(true);
    });

    it('rejects empty or whitespace-only project names', () => {
      const res1 = validateProjectName('');
      expect(res1.valid).toBe(false);
      expect(res1.reason).toContain('must not be empty');

      const res2 = validateProjectName('   ');
      expect(res2.valid).toBe(false);
    });

    it('rejects project names with path traversal sequences', () => {
      expect(validateProjectName('../evil').valid).toBe(false);
      expect(validateProjectName('/absolute/path').valid).toBe(false);
      expect(validateProjectName('\\windows\\path').valid).toBe(false);
    });

    it('rejects uppercase or otherwise invalid npm package names', () => {
      const res = validateProjectName('MyGame');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('npm naming rules');
    });
  });

  describe('2. Target Directory Checking (checkTargetDir)', () => {
    it('accepts a directory that does not exist', () => {
      const notExisting = path.join(tempDir, 'sub-dir');
      expect(checkTargetDir(notExisting).valid).toBe(true);
    });

    it('accepts an existing empty directory', () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);
      expect(checkTargetDir(emptyDir).valid).toBe(true);
    });

    it('rejects a non-empty directory without force', () => {
      const nonEmptyDir = path.join(tempDir, 'non-empty');
      fs.mkdirSync(nonEmptyDir);
      fs.writeFileSync(path.join(nonEmptyDir, 'file.txt'), 'hello');

      const res = checkTargetDir(nonEmptyDir, false);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('not empty');
    });

    it('accepts a non-empty directory when force is true', () => {
      const nonEmptyDir = path.join(tempDir, 'non-empty-forced');
      fs.mkdirSync(nonEmptyDir);
      fs.writeFileSync(path.join(nonEmptyDir, 'file.txt'), 'hello');

      const res = checkTargetDir(nonEmptyDir, true);
      expect(res.valid).toBe(true);
    });
  });

  describe('3. CLI Argument Parser (parseCliArgs)', () => {
    it('parses positional arguments and options', () => {
      const args = parseCliArgs(['my-game', '--template', 'nuxt', '--pm', 'pnpm']);
      expect(args.projectName).toBe('my-game');
      expect(args.template).toBe('nuxt');
      expect(args.packageManager).toBe('pnpm');
    });

    it('parses the short -t form and --pm with = syntax', () => {
      const args = parseCliArgs(['test-app', '-t=next-js', '--pm=yarn', '--force', '-y']);
      expect(args.projectName).toBe('test-app');
      expect(args.template).toBe('next-js');
      expect(args.packageManager).toBe('yarn');
      expect(args.force).toBe(true);
      expect(args.yes).toBe(true);
    });

    it('parses -t with a space-separated value', () => {
      const args = parseCliArgs(['test-app', '-t', 'next-js']);
      expect(args.template).toBe('next-js');
    });

    it('keeps everything after the first = in an inline value', () => {
      expect(parseCliArgs(['--template=a=b']).template).toBe('a=b');
    });

    it.each([
      [['app', '--template']],
      [['app', '--template', '--force']],
      [['app', '--pm']],
      [['app', '--pm', '-y']],
      [['app', '--template=']],
      [['app', '--pm=']],
    ])('throws when an option has no value: %j', (argv) => {
      expect(() => parseCliArgs(argv)).toThrow(/requires a value/);
    });

    it('rejects an unsupported package manager', () => {
      expect(() => parseCliArgs(['app', '--pm', 'foo'])).toThrow(/Invalid package manager "foo"/);
      expect(() => parseCliArgs(['app', '--pm=foo'])).toThrow(/Invalid package manager "foo"/);
      for (const pm of ['pnpm', 'npm', 'yarn', 'bun']) {
        expect(parseCliArgs(['app', '--pm', pm]).packageManager).toBe(pm);
      }
    });

    it('rejects unknown options instead of dropping them silently', () => {
      expect(() => parseCliArgs(['app', '--forse'])).toThrow(/Unknown option "--forse"/);
    });

    it('parses --help and -h', () => {
      expect(parseCliArgs(['--help']).help).toBe(true);
      expect(parseCliArgs(['-h']).help).toBe(true);
    });

    it('parses --version and -v', () => {
      expect(parseCliArgs(['--version']).version).toBe(true);
      expect(parseCliArgs(['-v']).version).toBe(true);
    });
  });

  describe('4. Project Scaffolding Engine (scaffoldProject)', () => {
    it('lists every shipped template as supported', () => {
      expect(SUPPORTED_TEMPLATES).toEqual(['nuxt', 'next-js']);
    });

    it('throws when the template is not supported', async () => {
      await expect(
        scaffoldProject({
          projectName: 'invalid-template-app',
          targetDir: path.join(tempDir, 'invalid'),
          template: 'angular-17' as any,
        }),
      ).rejects.toThrow('is not supported');
    });

    it('scaffolds the Nuxt template and substitutes placeholders', async () => {
      const targetDir = path.join(tempDir, 'test-nuxt');
      const result = await scaffoldProject({
        projectName: 'test-nuxt-game',
        targetDir,
        template: 'nuxt',
      });

      expect(result.template).toBe('nuxt');
      expect(fs.existsSync(targetDir)).toBe(true);

      const pkgJsonPath = path.join(targetDir, 'package.json');
      expect(fs.existsSync(pkgJsonPath)).toBe(true);
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      expect(pkgJson.name).toBe('test-nuxt-game');
      expect(pkgJson.dependencies['@hydraone/sdk']).toBe(`^${CLI_VERSION}`);

      const appVue = fs.readFileSync(path.join(targetDir, 'app.vue'), 'utf-8');
      expect(appVue).toContain('test-nuxt-game');
      expect(appVue).toContain('@hydraone/sdk/vue');
      expect(appVue).not.toContain('bootstrapDevShell');

      expect(fs.existsSync(path.join(targetDir, 'nuxt.config.ts'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'tsconfig.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, '.gitignore'))).toBe(true);
    });

    it('scaffolds the Next.js template and substitutes placeholders', async () => {
      const targetDir = path.join(tempDir, 'test-next');
      const result = await scaffoldProject({
        projectName: 'test-next-game',
        targetDir,
        template: 'next-js',
      });

      expect(result.template).toBe('next-js');
      expect(fs.existsSync(targetDir)).toBe(true);

      const pkgJsonPath = path.join(targetDir, 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      expect(pkgJson.name).toBe('test-next-game');
      expect(pkgJson.dependencies['@hydraone/sdk']).toBe(`^${CLI_VERSION}`);

      const layout = fs.readFileSync(path.join(targetDir, 'app/layout.tsx'), 'utf-8');
      expect(layout).toContain('Providers');
      expect(layout).toContain('test-next-game');

      const providers = fs.readFileSync(path.join(targetDir, 'app/providers.tsx'), 'utf-8');
      expect(providers).toContain('HydraOneProvider');

      const page = fs.readFileSync(path.join(targetDir, 'app/page.tsx'), 'utf-8');
      expect(page).toContain('useWallet');
      expect(page).toContain('useHydraAuth');
      expect(page).not.toContain('bootstrapDevShell');
    });

    it('keeps a scoped package name in package.json', async () => {
      const targetDir = path.join(tempDir, 'test-scoped');
      const result = await scaffoldProject({
        projectName: '@hydra/cardano-game',
        targetDir,
        template: 'nuxt',
      });

      expect(result.template).toBe('nuxt');
      const pkgJson = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8'));
      expect(pkgJson.name).toBe('@hydra/cardano-game');
    });

    it('substitutes safely when the replacement contains special characters ($)', async () => {
      const srcDir = path.join(tempDir, 'src-dollar');
      const dstDir = path.join(tempDir, 'dst-dollar');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'test.txt'), 'Value: {{TOKEN}}');

      await copyTemplateDir(srcDir, dstDir, {
        '{{TOKEN}}': 'special-$&-pattern-$1',
      });

      const result = fs.readFileSync(path.join(dstDir, 'test.txt'), 'utf-8');
      expect(result).toBe('Value: special-$&-pattern-$1');
    });
  });

  describe('5. CLI Binary Execution (bin/create-hydraone-game.js)', () => {
    const binScript = path.resolve(__dirname, '../../bin/create-hydraone-game.js');

    it('runs with --help', () => {
      const output = execSync(`node "${binScript}" --help`, { encoding: 'utf-8' });
      expect(output).toContain('create-hydraone-game');
      expect(output).toContain('USAGE:');
      expect(output).toContain('--template');
    });

    it('runs with --version', () => {
      const output = execSync(`node "${binScript}" --version`, { encoding: 'utf-8' });
      expect(output.trim()).toBe(`v${CLI_VERSION}`);
    });

    it('scaffolds non-interactively with --yes', () => {
      const targetDir = path.join(tempDir, 'cli-auto-app');
      execSync(`node "${binScript}" "${targetDir}" --template nuxt --pm pnpm --yes`, {
        encoding: 'utf-8',
      });

      expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'app.vue'))).toBe(true);
    });

    it('fails when --template is invalid', () => {
      const result = spawnSync(
        'node',
        [binScript, path.join(tempDir, 'invalid-tmpl'), '--template', 'bogus-template', '--yes'],
        { encoding: 'utf-8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid template "bogus-template"');
    });

    it('exits 1 with a clear message for an option without a value or an unknown option', () => {
      const missing = spawnSync('node', [binScript, 'app', '--template'], { encoding: 'utf-8' });
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('requires a value');

      const unknown = spawnSync('node', [binScript, 'app', '--forse'], { encoding: 'utf-8' });
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain('Unknown option "--forse"');
    });

    it('refuses a non-empty directory without --force and scaffolds into it with --force', () => {
      const targetDir = path.join(tempDir, 'occupied');
      fs.mkdirSync(targetDir);
      fs.writeFileSync(path.join(targetDir, 'keep.txt'), 'mine');

      const refused = spawnSync('node', [binScript, targetDir, '--template', 'nuxt', '--yes'], {
        encoding: 'utf-8',
      });
      expect(refused.status).toBe(1);
      expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(false);

      const forced = spawnSync(
        'node',
        [binScript, targetDir, '--template', 'nuxt', '--yes', '--force'],
        { encoding: 'utf-8' },
      );
      expect(forced.status).toBe(0);
      expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
      expect(fs.readFileSync(path.join(targetDir, 'keep.txt'), 'utf-8')).toBe('mine');
    });

    it('uses the nuxt template by default with --yes', () => {
      const targetDir = path.join(tempDir, 'default-tmpl');
      const result = spawnSync('node', [binScript, targetDir, '--yes'], { encoding: 'utf-8' });
      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(targetDir, 'app.vue'))).toBe(true);
    });

    it('prints the real directory in the cd hint for a scoped project name', () => {
      const result = spawnSync(
        'node',
        [binScript, '@scope/scoped-game', '--template', 'nuxt', '--yes'],
        { encoding: 'utf-8', cwd: tempDir },
      );
      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'scoped-game', 'package.json'))).toBe(true);
      expect(result.stdout).toContain('cd scoped-game');
      expect(result.stdout).not.toContain('cd @scope/scoped-game');
    });
  });
});

describe('scaffolder template hygiene', () => {
  it('never copies dependency or build output directories', async () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-src-'));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-dest-'));
    try {
      for (const dir of ['node_modules', '.next', '.nuxt', '.output', 'dist']) {
        fs.mkdirSync(path.join(src, dir), { recursive: true });
        fs.writeFileSync(path.join(src, dir, 'x.txt'), 'x');
      }
      fs.writeFileSync(path.join(src, 'next-env.d.ts'), '');
      fs.writeFileSync(path.join(src, 'keep.txt'), 'keep');

      await copyTemplateDir(src, dest, {});

      expect(fs.readdirSync(dest)).toEqual(['keep.txt']);
    } finally {
      fs.rmSync(src, { recursive: true, force: true });
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

  it('copies binary assets byte for byte, whatever their extension', async () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-src-'));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-dest-'));
    try {
      // Bytes that are not valid UTF-8 and contain NUL would be corrupted by a text round-trip
      const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x81, 0x00, 0xc3, 0x28, 0x7b, 0x7b]);
      const names = ['font.woff2', 'model.glb', 'clip.mp4', 'doc.pdf', 'face.ttf'];
      for (const name of names) {
        fs.writeFileSync(path.join(src, name), bytes);
      }
      fs.writeFileSync(path.join(src, 'note.txt'), 'hello {{NAME}}');

      await copyTemplateDir(src, dest, { '{{NAME}}': 'world' });

      for (const name of names) {
        expect(fs.readFileSync(path.join(dest, name)).equals(bytes)).toBe(true);
      }
      expect(fs.readFileSync(path.join(dest, 'note.txt'), 'utf-8')).toBe('hello world');
    } finally {
      fs.rmSync(src, { recursive: true, force: true });
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

  it('never leaves a workspace: range in a scaffolded project', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-ws-'));
    try {
      for (const template of ['nuxt', 'next-js'] as const) {
        const dir = path.join(tmp, template);
        await scaffoldProject({ projectName: `ws-${template}`, targetDir: dir, template });
        const pkg = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
        expect(pkg).not.toContain('workspace:');
        expect(JSON.parse(pkg).dependencies['@hydraone/sdk']).toBe(`^${CLI_VERSION}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('ships the host origin config and embed helpers in both templates', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-tpl-'));
    try {
      for (const [template, helper] of [
        ['next-js', 'lib/hydra.ts'],
        ['nuxt', 'utils/hydra.ts'],
      ] as const) {
        const dir = path.join(tmp, template);
        await scaffoldProject({ projectName: `demo-${template}`, targetDir: dir, template });
        expect(fs.existsSync(path.join(dir, '.env.example'))).toBe(true);
        expect(fs.readFileSync(path.join(dir, helper), 'utf-8')).toContain('resolveHostOrigin');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
