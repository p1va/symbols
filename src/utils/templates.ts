/**
 * Template management utilities for configuration templates
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the templates directory
 */
function getTemplatesDir(): string {
  // When running from dist/, templates are in ../assets/templates
  // When running from src/, templates are in ../../assets/templates
  const distPath = path.resolve(__dirname, '../../assets/templates');
  const srcPath = path.resolve(__dirname, '../../../assets/templates');

  if (fs.existsSync(distPath)) {
    return distPath;
  } else if (fs.existsSync(srcPath)) {
    return srcPath;
  } else {
    throw new Error('Templates directory not found');
  }
}

export interface Template {
  name: string;
  description: string;
  filename: string;
}

/**
 * Extract description from YAML file comments
 */
function extractDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Look for description in comments at the start of the file (before 'lsps:')
    const commentLines: string[] = [];
    let foundLsps = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Stop when we hit the lsps: key
      if (trimmed === 'lsps:') {
        foundLsps = true;
        break;
      }

      // Collect top-level comments
      if (trimmed.startsWith('#')) {
        const comment = trimmed.substring(1).trim();
        if (comment) {
          commentLines.push(comment);
        }
      }
    }

    // If we found comments before lsps:, use them
    if (foundLsps && commentLines.length > 0) {
      // Take first line as primary description
      const firstComment = commentLines[0];
      if (firstComment) {
        return firstComment;
      }
    }

    // Parse YAML to get LSP names as fallback description
    const config = yaml.load(content) as { lsps?: Record<string, unknown> };
    if (config.lsps) {
      const lspNames = Object.keys(config.lsps);
      if (lspNames.length === 1) {
        return `Configuration for ${lspNames[0]}`;
      } else if (lspNames.length > 1) {
        return `Configuration for ${lspNames.join(', ')}`;
      }
    }

    return 'Configuration template';
  } catch {
    return 'Configuration template';
  }
}

/**
 * List all available templates
 */
export function listTemplates(): Template[] {
  const templatesDir = getTemplatesDir();
  const files = fs.readdirSync(templatesDir);

  const templates: Template[] = files
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .map((filename) => {
      const filePath = path.join(templatesDir, filename);
      const name = path.basename(filename, path.extname(filename));
      const description = extractDescription(filePath);

      return {
        name,
        description,
        filename,
      };
    })
    .sort((a, b) => {
      // Put default first
      if (a.name === 'default') return -1;
      if (b.name === 'default') return 1;
      return a.name.localeCompare(b.name);
    });

  return templates;
}

/**
 * Get the content of a specific template
 */
export function getTemplateContent(templateName: string): string {
  const templatesDir = getTemplatesDir();
  const templates = listTemplates();

  const template = templates.find((t) => t.name === templateName);
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available templates: ${templates.map((t) => t.name).join(', ')}`
    );
  }

  const filePath = path.join(templatesDir, template.filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Show list of templates in a formatted way
 */
export function showTemplateList(): void {
  const templates = listTemplates();

  console.log('Available configuration templates:\n');

  for (const template of templates) {
    console.log(`  ${template.name}`);
    console.log(`    ${template.description}`);
    console.log();
  }

  console.log('Usage:');
  console.log('  symbols template show <name>        Show template content');
  console.log('  symbols template show <name> > symbols.yaml');
  console.log('                                      Save template to file');
  console.log();
  console.log('Example:');
  console.log(
    '  npx -y "@p1va/symbols@latest" template show typescript > symbols.yaml'
  );
}

/**
 * Show a specific template
 */
export function showTemplate(templateName: string): void {
  try {
    const content = getTemplateContent(templateName);
    console.log(content);
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
