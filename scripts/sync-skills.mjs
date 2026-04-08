#!/usr/bin/env node

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceSkillsDir = path.join(repoRoot, '.agents', 'skills');
const codexPluginSkillsDir = path.join(
  repoRoot,
  'plugins',
  'symbols',
  'skills'
);
const geminiSkillsDir = path.join(repoRoot, 'skills');
const geminiContextPath = path.join(repoRoot, 'GEMINI.md');

function renderGeminiContext() {
  return `# Symbols Extension

This Gemini CLI extension adds the Symbols MCP server.
Use the native Gemini extension skills in \`./skills\` for language server setup and semantic code navigation.
`;
}

async function listSkillNames() {
  const entries = await readdir(sourceSkillsDir, { withFileTypes: true });
  const names = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const files = await readdir(path.join(sourceSkillsDir, entry.name));
        return files.includes('SKILL.md') ? entry.name : null;
      })
  );

  return names.filter(Boolean).sort();
}

async function main() {
  const skillNames = await listSkillNames();

  await rm(codexPluginSkillsDir, { recursive: true, force: true });
  await rm(geminiSkillsDir, { recursive: true, force: true });
  await mkdir(codexPluginSkillsDir, { recursive: true });
  await mkdir(geminiSkillsDir, { recursive: true });

  for (const skillName of skillNames) {
    const sourceSkillPath = path.join(sourceSkillsDir, skillName);
    await cp(sourceSkillPath, path.join(codexPluginSkillsDir, skillName), {
      recursive: true,
    });
    await cp(sourceSkillPath, path.join(geminiSkillsDir, skillName), {
      recursive: true,
    });
  }

  const geminiContext = renderGeminiContext();
  await writeFile(geminiContextPath, geminiContext, 'utf8');

  process.stdout.write(
    `Synced ${skillNames.length} skill(s) to plugins/symbols/skills and skills/, and regenerated GEMINI.md\n`
  );
}

await main();
