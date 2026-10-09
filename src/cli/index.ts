import * as path from 'node:path';
import type { CliArgs, TemplateType, PackageManager } from './types';
import { SUPPORTED_TEMPLATES, scaffoldProject, validateProjectName } from './scaffolder';
import { askQuestion, createReadline, selectOption, style } from './prompts';

import { CLI_VERSION } from './types';
export { CLI_VERSION } from './types';

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--yes' || arg === '-y') {
      args.yes = true;
    } else if (arg === '--template' || arg === '-t') {
      if (i + 1 < argv.length) {
        args.template = argv[++i] as TemplateType;
      }
    } else if (arg.startsWith('--template=') || arg.startsWith('-t=')) {
      args.template = arg.split('=')[1] as TemplateType;
    } else if (arg === '--pm') {
      if (i + 1 < argv.length) {
        args.packageManager = argv[++i] as PackageManager;
      }
    } else if (arg.startsWith('--pm=')) {
      args.packageManager = arg.split('=')[1] as PackageManager;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    args.projectName = positional[0];
  }

  return args;
}

export function printHelp(): void {
  console.log(`
${style('create-hydraone-game', 'cyan')} ${style(`v${CLI_VERSION}`, 'dim')}
${style('Scaffold a Web3 game project with the HydraOne SDK on Cardano', 'bold')}

${style('USAGE:', 'yellow')}
  $ npx create-hydraone-game [project-name] [options]

${style('OPTIONS:', 'yellow')}
  -t, --template <name>   Select a template (${SUPPORTED_TEMPLATES.join(', ')})
  --pm <package-manager>  Select a package manager (pnpm, npm, yarn, bun)
  --force                 Use the target directory even if it is not empty
  -y, --yes               Skip prompts and use default values
  -h, --help              Show this help
  -v, --version           Show the CLI version

${style('EXAMPLES:', 'yellow')}
  $ npx create-hydraone-game my-hydra-game
  $ npx create-hydraone-game my-phaser-game --template phaser-3
  $ npx create-hydraone-game my-nuxt-app --template nuxt-3 --pm pnpm
`);
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(`v${CLI_VERSION}`);
    return;
  }

  console.log(`
${style('HydraOne Game Scaffolder', 'cyan')} ${style(`(v${CLI_VERSION})`, 'dim')}
${style('Scaffold a Cardano Web3 game with the HydraOne SDK and DevTools simulator', 'dim')}
`);

  let projectName = args.projectName;
  let template = args.template;
  let pm: PackageManager = args.packageManager || 'pnpm';

  if (args.template && !SUPPORTED_TEMPLATES.includes(args.template)) {
    console.error(
      `\n${style('Error:', 'red')} Invalid template "${args.template}". Supported templates: ${SUPPORTED_TEMPLATES.join(', ')}\n`,
    );
    process.exit(1);
  }

  const isInteractive = !args.yes && (!projectName || !template);

  if (isInteractive) {
    const rl = createReadline();
    try {
      if (!projectName) {
        while (true) {
          const inputName = await askQuestion(
            rl,
            'What is your project directory name?',
            'hydraone-game-starter',
          );
          const validation = validateProjectName(inputName);
          if (validation.valid) {
            projectName = inputName;
            break;
          }
          console.log(style(validation.reason ?? 'Invalid project name.', 'red'));
        }
      }

      if (!template || !SUPPORTED_TEMPLATES.includes(template)) {
        template = await selectOption<TemplateType>(
          rl,
          'Select a framework / game engine template:',
          [
            {
              label: 'Nuxt 3 (Vue 3.5+ Headless Composables)',
              value: 'nuxt-3',
              description: 'Includes @hydraone/sdk/vue and an SSR-safe setup',
            },
            {
              label: 'Next.js (React 19+ Headless Hooks & Provider)',
              value: 'next-js',
              description: 'Includes @hydraone/sdk/react and HydraOneProvider',
            },
            {
              label: 'Phaser 3 (Canvas Game Loop & EventEmitter)',
              value: 'phaser-3',
              description: 'Includes a Phaser scene and WalletBridgeClient',
            },
          ],
        );
      }

      if (!args.packageManager) {
        pm = await selectOption<PackageManager>(rl, 'Select a package manager:', [
          { label: 'pnpm (recommended)', value: 'pnpm' },
          { label: 'npm', value: 'npm' },
          { label: 'yarn', value: 'yarn' },
          { label: 'bun', value: 'bun' },
        ]);
      }
    } finally {
      rl.close();
    }
  } else {
    if (!projectName) {
      projectName = 'hydraone-game-starter';
    }
    if (!template) {
      template = 'nuxt-3';
    }
  }

  const targetDirName =
    projectName?.startsWith('@') && projectName.includes('/')
      ? projectName.split('/')[1]
      : projectName;
  const targetDir = path.resolve(process.cwd(), targetDirName);

  console.log(`\n${style('Creating project...', 'yellow')}`);
  console.log(`  - Directory: ${style(projectName, 'bold')}`);
  console.log(`  - Template:  ${style(template, 'green')}`);
  console.log(`  - PM:        ${style(pm, 'dim')}`);

  try {
    await scaffoldProject({
      projectName,
      targetDir,
      template,
      packageManager: pm,
      force: args.force,
    });

    console.log(`\n${style('Project created successfully.', 'green')}\n`);
    console.log(style('Next, run the following commands to start developing:', 'bold'));
    console.log(`  ${style(`cd ${projectName}`, 'cyan')}`);
    console.log(`  ${style(`${pm} install`, 'cyan')}`);
    console.log(`  ${style(`${pm} run dev`, 'cyan')}\n`);
    console.log(
      style(
        'Develop: the dev server wraps your game in a copy of the HydraOne web client (header, wallet, viewport).',
        'green',
      ),
    );
    console.log(
      style(
        'Publish: deploy anywhere, set the HYDRA_HOST_ORIGIN variable from .env.example, then submit the deployed URL to the HydraOne web client. See README.md.\n',
        'dim',
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${style('Failed to create project:', 'red')} ${message}\n`);
    process.exit(1);
  }
}

export * from './types';
export * from './scaffolder';
export * from './prompts';
