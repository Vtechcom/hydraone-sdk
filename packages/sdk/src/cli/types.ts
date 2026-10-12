/**
 * Types and interfaces for create-hydraone-game CLI Scaffolder
 */

/** Version of the CLI, injected from package.json at build time. */
export const CLI_VERSION: string = __SDK_VERSION__;

export type TemplateType = 'nuxt-3' | 'next-js' | 'phaser-3';

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  template: TemplateType;
  packageManager?: PackageManager;
  skipInstall?: boolean;
  force?: boolean;
}

export interface CliArgs {
  projectName?: string;
  template?: TemplateType;
  packageManager?: PackageManager;
  help?: boolean;
  version?: boolean;
  force?: boolean;
  yes?: boolean;
}

export interface TemplateMetadata {
  name: string;
  description: string;
  framework: string;
}
