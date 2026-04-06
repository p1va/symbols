#!/usr/bin/env node

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceSkillsDir = path.join(repoRoot, '.agents', 'skills');
const codexPluginSkillsDir = path.join(repoRoot, 'plugins', 'symbols', 'skills');
const geminiSkillsDir = path.join(repoRoot, 'skills');
const geminiContextPath = path.join(repoRoot, 'GEMINI.md');

function renderGeminiContext() {
  return `# Symbols Extension

This Gemini CLI extension adds the Symbols MCP server.
Use the native Gemini extension skills in \`./skills\` for language server setup and semantic code navigation.
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
  await rm(geminiSkillsDir, { recursive: true, force: true });
  await mkdir(path.dirname(codexPluginSkillsDir), { recursive: true });
  await mkdir(path.dirname(geminiSkillsDir), { recursive: true });
  await cp(sourceSkillsDir, codexPluginSkillsDir, { recursive: true });
  await cp(sourceSkillsDir, geminiSkillsDir, { recursive: true });

  const geminiContext = renderGeminiContext();
  await writeFile(geminiContextPath, geminiContext, 'utf8');

  process.stdout.write(
    `Synced ${skillNames.length} skill(s) to plugins/symbols/skills and skills/, and regenerated GEMINI.md\n`
  );
}

await main();
