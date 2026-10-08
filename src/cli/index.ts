import * as path from 'node:path';
import type { CliArgs, TemplateType, PackageManager } from './types';
import { SUPPORTED_TEMPLATES, scaffoldProject, validateProjectName } from './scaffolder';
import { askQuestion, createReadline, selectOption, style } from './prompts';

export const CLI_VERSION = '0.1.0';

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
${style('Công cụ khởi tạo nhanh dự án game Web3 tích hợp HydraOne SDK trên Cardano', 'bold')}

${style('CÚ PHÁP:', 'yellow')}
  $ npx create-hydraone-game [tên-dự-án] [options]

${style('CÁC OPTIONS:', 'yellow')}
  -t, --template <name>   Chọn template sẵn có (${SUPPORTED_TEMPLATES.join(', ')})
  --pm <package-manager>  Chọn package manager (pnpm, npm, yarn, bun)
  --force                 Ghi đè hoặc sử dụng thư mục hiện có ngay cả khi có files
  -y, --yes               Bỏ qua xác nhận prompt, sử dụng giá trị mặc định
  -h, --help              Hiển thị bảng trợ giúp này
  -v, --version           Hiển thị phiên bản CLI

${style('VÍ DỤ:', 'yellow')}
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
${style('🎮 HydraOne Game Scaffolder', 'cyan')} ${style(`(v${CLI_VERSION})`, 'dim')}
${style('Khởi tạo dự án game Web3 Cardano với HydraOne SDK & DevTools Simulator', 'dim')}
`);

  let projectName = args.projectName;
  let template = args.template;
  let pm: PackageManager = args.packageManager || 'pnpm';

  const isInteractive = !args.yes && (!projectName || !template);

  if (isInteractive) {
    const rl = createReadline();
    try {
      if (!projectName) {
        while (true) {
          const inputName = await askQuestion(
            rl,
            'Tên thư mục dự án của bạn là gì?',
            'hydraone-game-starter'
          );
          const validation = validateProjectName(inputName);
          if (validation.valid) {
            projectName = inputName;
            break;
          }
          console.log(style(`❌ ${validation.reason}`, 'red'));
        }
      }

      if (!template || !SUPPORTED_TEMPLATES.includes(template)) {
        template = await selectOption<TemplateType>(
          rl,
          'Chọn Framework / Game Engine template:',
          [
            {
              label: 'Nuxt 3 (Vue 3.5+ Headless Composables)',
              value: 'nuxt-3',
              description: 'Tích hợp sẵn @hydraone/sdk/vue và SSR-safe setup',
            },
            {
              label: 'Next.js (React 19+ Headless Hooks & Provider)',
              value: 'next-js',
              description: 'Tích hợp sẵn @hydraone/sdk/react và HydraOneProvider',
            },
            {
              label: 'Phaser 3 (Canvas Game Loop & EventEmitter)',
              value: 'phaser-3',
              description: 'Tích hợp sẵn Phaser Scene và WalletBridgeClient',
            },
          ]
        );
      }

      if (!args.packageManager) {
        pm = await selectOption<PackageManager>(
          rl,
          'Chọn Trình quản lý gói (Package Manager):',
          [
            { label: 'pnpm (Khuyến nghị)', value: 'pnpm' },
            { label: 'npm', value: 'npm' },
            { label: 'yarn', value: 'yarn' },
            { label: 'bun', value: 'bun' },
          ]
        );
      }
    } finally {
      rl.close();
    }
  } else {
    if (!projectName) {
      projectName = 'hydraone-game-starter';
    }
    if (!template || !SUPPORTED_TEMPLATES.includes(template)) {
      template = 'nuxt-3';
    }
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  console.log(`\n${style('⚙️  Đang khởi tạo dự án...', 'yellow')}`);
  console.log(`  • Thư mục:  ${style(projectName, 'bold')}`);
  console.log(`  • Template: ${style(template, 'green')}`);
  console.log(`  • PM:       ${style(pm, 'dim')}`);

  try {
    await scaffoldProject({
      projectName,
      targetDir,
      template,
      packageManager: pm,
      force: args.force,
    });

    console.log(`\n${style('✨ Dự án game đã được tạo thành công!', 'green')}\n`);
    console.log(style('Tiếp theo, hãy chạy các lệnh sau để bắt đầu phát triển:', 'bold'));
    console.log(`  ${style(`cd ${projectName}`, 'cyan')}`);
    console.log(`  ${style(`${pm} install`, 'cyan')}`);
    console.log(`  ${style(`${pm} run dev`, 'cyan')}\n`);
    console.log(
      style(
        '💡 Gợi ý: Widget Floating DevTools đã được bật sẵn để test ví Mock và Safari ITP trên localhost:3000!',
        'dim'
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${style('❌ Lỗi khởi tạo dự án:', 'red')} ${message}\n`);
    process.exit(1);
  }
}

export * from './types';
export * from './scaffolder';
export * from './prompts';
