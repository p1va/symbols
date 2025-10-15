/**
 * Universal file extension mappings for all common LSP servers
 * Used when running in direct command mode (without YAML config)
 * Based on lang-identifier.md
 *
 * This single mapping works for all LSPs - the LSP will only handle
 * files it recognizes and ignore the rest.
 */

/**
 * Universal extension to language ID mapping
 * Covers all common programming languages
 */
export const UNIVERSAL_EXTENSIONS: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.json': 'json',
  '.jsonc': 'json',

  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // C#
  '.cs': 'csharp',
  '.cshtml': 'razor',
  '.razor': 'razor',

  // Java
  '.java': 'java',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',

  // Additional common languages
  '.rb': 'ruby',
  '.rbw': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  '.php': 'php',
  '.phtml': 'php',
  '.php3': 'php',
  '.php4': 'php',
  '.php5': 'php',
  '.phps': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sc': 'scala',
  '.lua': 'lua',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.fish': 'shellscript',
  '.r': 'r',
  '.R': 'r',
  '.rmd': 'r',
  '.Rmd': 'r',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mdown': 'markdown',
  '.mkd': 'markdown',
};
