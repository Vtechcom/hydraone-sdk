import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
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
      const args = parseCliArgs(['my-game', '--template', 'nuxt-3', '--pm', 'pnpm']);
      expect(args.projectName).toBe('my-game');
      expect(args.template).toBe('nuxt-3');
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
      const args = parseCliArgs(['test-app', '-t', 'phaser-3']);
      expect(args.template).toBe('phaser-3');
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
      expect(SUPPORTED_TEMPLATES).toEqual(['nuxt-3', 'next-js', 'phaser-3']);
    });

    it('throws when the template is not supported', async () => {
      await expect(
        scaffoldProject({
          projectName: 'invalid-template-app',
          targetDir: path.join(tempDir, 'invalid'),
          template: 'angular-17' as any,
        })
      ).rejects.toThrow('is not supported');
    });

    it('scaffolds the Nuxt 3 template and substitutes placeholders', async () => {
      const targetDir = path.join(tempDir, 'test-nuxt');
      const result = await scaffoldProject({
        projectName: 'test-nuxt-game',
        targetDir,
        template: 'nuxt-3',
      });

      expect(result.template).toBe('nuxt-3');
      expect(fs.existsSync(targetDir)).toBe(true);

      const pkgJsonPath = path.join(targetDir, 'package.json');
      expect(fs.existsSync(pkgJsonPath)).toBe(true);
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      expect(pkgJson.name).toBe('test-nuxt-game');
      expect(pkgJson.dependencies['@hydraone/sdk']).toBeDefined();

      const appVue = fs.readFileSync(path.join(targetDir, 'app.vue'), 'utf-8');
      expect(appVue).toContain('test-nuxt-game');
      expect(appVue).toContain('@hydraone/sdk/vue');
      expect(appVue).toContain('mountDevTools');

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
      expect(pkgJson.dependencies['@hydraone/sdk']).toBeDefined();

      const layout = fs.readFileSync(path.join(targetDir, 'app/layout.tsx'), 'utf-8');
      expect(layout).toContain('Providers');
      expect(layout).toContain('test-next-game');

      const providers = fs.readFileSync(path.join(targetDir, 'app/providers.tsx'), 'utf-8');
      expect(providers).toContain('HydraOneProvider');

      const page = fs.readFileSync(path.join(targetDir, 'app/page.tsx'), 'utf-8');
      expect(page).toContain('useWallet');
      expect(page).toContain('useHydraAuth');
      expect(page).toContain('mountDevTools');
    });

    it('scaffolds the Phaser 3 template and substitutes placeholders', async () => {
      const targetDir = path.join(tempDir, 'test-phaser');
      const result = await scaffoldProject({
        projectName: 'test-phaser-game',
        targetDir,
        template: 'phaser-3',
      });

      expect(result.template).toBe('phaser-3');
      expect(fs.existsSync(targetDir)).toBe(true);

      const pkgJsonPath = path.join(targetDir, 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      expect(pkgJson.name).toBe('test-phaser-game');
      expect(pkgJson.dependencies['@hydraone/sdk']).toBeDefined();
      expect(pkgJson.dependencies['phaser']).toBeDefined();

      const indexHtml = fs.readFileSync(path.join(targetDir, 'index.html'), 'utf-8');
      expect(indexHtml).toContain('test-phaser-game');

      const mainTs = fs.readFileSync(path.join(targetDir, 'src/main.ts'), 'utf-8');
      expect(mainTs).toContain('WalletBridgeClient');
      expect(mainTs).toContain('mountDevTools');
      expect(mainTs).toContain('test-phaser-game');
    });

    it('keeps a scoped package name in package.json', async () => {
      const targetDir = path.join(tempDir, 'test-scoped');
      const result = await scaffoldProject({
        projectName: '@hydra/cardano-game',
        targetDir,
        template: 'nuxt-3',
      });

      expect(result.template).toBe('nuxt-3');
      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8')
      );
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
      execSync(
        `node "${binScript}" "${targetDir}" --template nuxt-3 --pm pnpm --yes`,
        { encoding: 'utf-8' }
      );

      expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'app.vue'))).toBe(true);
    });

    it('fails when --template is invalid', () => {
      expect(() => {
        execSync(
          `node "${binScript}" "${path.join(tempDir, 'invalid-tmpl')}" --template bogus-template --yes`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }).toThrow();
    });
  });
});
