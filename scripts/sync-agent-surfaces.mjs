#!/usr/bin/env node

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceSkillsDir = path.join(repoRoot, '.agents', 'skills');
const codexPluginSkillsDir = path.join(repoRoot, 'plugins', 'symbols', 'skills');
const geminiContextPath = path.join(repoRoot, 'GEMINI.md');

function renderGeminiContext(skillNames) {
  const imports = skillNames
    .map((skillName) => `@./.agents/skills/${skillName}/SKILL.md`)
    .join('\n\n');

  return `# Symbols Extension

This Gemini CLI extension adds the Symbols MCP server and shared instructions for language server setup and semantic code navigation.

${imports}
`;
}

async function listSymbolsSkillNames() {
  const entries = await readdir(sourceSkillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('symbols-'))
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  const skillNames = await listSymbolsSkillNames();

  await rm(codexPluginSkillsDir, { recursive: true, force: true });
  await mkdir(path.dirname(codexPluginSkillsDir), { recursive: true });
  await cp(sourceSkillsDir, codexPluginSkillsDir, { recursive: true });

  const geminiContext = renderGeminiContext(skillNames);
  await writeFile(geminiContextPath, geminiContext, 'utf8');

  process.stdout.write(
    `Synced ${skillNames.length} skill(s) to plugins/symbols/skills and regenerated GEMINI.md\n`
  );
}

await main();
