import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const packageJsonPath = path.join(repoRoot, 'package.json');
const targetPaths = [
  path.join(repoRoot, 'gemini-extension.json'),
  path.join(repoRoot, 'plugins', 'symbols', '.codex-plugin', 'plugin.json'),
];

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const packageJson = await readJson(packageJsonPath);
const version = packageJson.version;

if (typeof version !== 'string' || version.length === 0) {
  throw new Error(`Invalid package version in ${packageJsonPath}`);
}

const updatedPaths = [];

for (const targetPath of targetPaths) {
  const targetJson = await readJson(targetPath);
  if (targetJson.version === version) {
    continue;
  }

  targetJson.version = version;
  await writeJson(targetPath, targetJson);
  updatedPaths.push(path.relative(repoRoot, targetPath));
}

if (updatedPaths.length === 0) {
  console.log(`Version ${version} already synced`);
} else {
  console.log(`Synced version ${version} to ${updatedPaths.join(', ')}`);
}
