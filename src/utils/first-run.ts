import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import { getAppPaths } from './app-paths.js';

const req = createRequire(import.meta.url);
const DEFAULT_CONFIG_NAME = 'symbols.yaml';
const DEFAULT_CONFIG_ASSET = 'default-symbols.yaml';

/**
 * Checks if this is the first run by looking for existing configuration
 * files in user directories and creates default config if none exists.
 */
export async function handleFirstRun(): Promise<void> {
  try {
    const paths = getAppPaths();
    const userConfigPath = path.join(paths.config, DEFAULT_CONFIG_NAME);

    // Check if user config directory exists
    const configDirExists = fs.existsSync(paths.config);
    const configFileExists = fs.existsSync(userConfigPath);

    // If both directory and file don't exist, this is likely a first run
    if (!configDirExists || !configFileExists) {
      await createDefaultConfig(paths.config, userConfigPath);
    } else {
      logger.debug('Configuration file already exists', {
        path: userConfigPath,
      });
    }
  } catch (error) {
    logger.warn('Failed to handle first run setup', { error });
  }
}

/**
 * Creates the default configuration file in the user's config directory
 */
async function createDefaultConfig(
  configDir: string,
  configPath: string
): Promise<void> {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      logger.info('Created config directory', { path: configDir });
    }

    // Resolve the asset path using Node.js module resolution
    const assetConfigPath = req.resolve(
      `@p1va/symbols/assets/${DEFAULT_CONFIG_ASSET}`
    );

    // Read the default config from assets
    const defaultConfigContent = await readFile(assetConfigPath, 'utf8');

    // Write default config to user directory
    fs.writeFileSync(configPath, defaultConfigContent);

    logger.info('Created default configuration file', {
      path: configPath,
      message:
        'You can customize this file to add more Language Servers or modify existing ones',
    });
  } catch (error) {
    logger.warn('Failed to create default configuration', {
      error,
      configPath,
      message: 'Could not resolve or read default config asset',
    });
  }
}

/**
 * Gets the path to the user's config directory
 */
export function getUserConfigPath(): string {
  const paths = getAppPaths();
  return path.join(paths.config, DEFAULT_CONFIG_NAME);
}

/**
 * Checks if user has any existing configuration
 */
export function hasExistingConfig(): boolean {
  const paths = getAppPaths();
  const userConfigPath = path.join(paths.config, DEFAULT_CONFIG_NAME);

  // Check various possible config file locations
  const possibleConfigs = [
    userConfigPath,
    path.join(paths.config, 'symbols.yml'),
    path.join(paths.config, 'lsps.yaml'), // legacy
    path.join(paths.config, 'lsps.yml'), // legacy
  ];

  return possibleConfigs.some((configPath) => fs.existsSync(configPath));
}
