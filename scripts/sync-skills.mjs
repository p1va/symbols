#!/usr/bin/env node

import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceSkillsDir = path.join(repoRoot, '.agents', 'skills');
const destinationSkillsDirs = [
  path.join(repoRoot, 'skills'),
  path.join(repoRoot, 'plugins', 'symbols', 'skills'),
];

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

  for (const destinationSkillsDir of destinationSkillsDirs) {
    await rm(destinationSkillsDir, { recursive: true, force: true });
    await mkdir(destinationSkillsDir, { recursive: true });

    for (const skillName of skillNames) {
      const sourceSkillPath = path.join(sourceSkillsDir, skillName);
      await cp(sourceSkillPath, path.join(destinationSkillsDir, skillName), {
        recursive: true,
      });
    }
  }

  process.stdout.write(
    `Synced ${skillNames.length} skill(s) to ${destinationSkillsDirs.length} plugin distributions\n`
  );
}

await main();
