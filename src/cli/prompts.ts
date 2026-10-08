import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

export function style(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

export function createReadline(): readline.Interface {
  const rl = readline.createInterface({ input, output });
  rl.on('SIGINT', () => {
    console.log(`\n${style('Đã hủy tiến trình.', 'yellow')}`);
    process.exit(0);
  });
  return rl;
}

export async function askQuestion(
  rl: readline.Interface,
  query: string,
  defaultValue = ''
): Promise<string> {
  const prompt = defaultValue
    ? `${query} ${style(`(${defaultValue})`, 'dim')}: `
    : `${query}: `;
  const answer = await rl.question(prompt);
  return answer.trim() || defaultValue;
}

export async function selectOption<T extends string>(
  rl: readline.Interface,
  title: string,
  options: { label: string; value: T; description?: string }[]
): Promise<T> {
  console.log(`\n${style('?', 'cyan')} ${style(title, 'bold')}`);
  options.forEach((opt, index) => {
    const num = index + 1;
    const desc = opt.description ? ` - ${style(opt.description, 'dim')}` : '';
    console.log(`  ${style(`${num})`, 'cyan')} ${opt.label}${desc}`);
  });

  while (true) {
    const answer = await rl.question(
      `${style('Chọn số [1-' + options.length + ']', 'yellow')}: `
    );
    const chosenIndex = parseInt(answer.trim(), 10) - 1;
    if (chosenIndex >= 0 && chosenIndex < options.length) {
      return options[chosenIndex].value;
    }
    console.log(
      style(`Lựa chọn không hợp lệ. Vui lòng nhập từ 1 đến ${options.length}.`, 'red')
    );
  }
}
