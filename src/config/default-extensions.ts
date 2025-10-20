/**
 * Default file extension to language ID mappings for common programming languages
 * Based on lang-identifier.md
 *
 * These defaults are automatically available for all LSP configurations.
 * User-specified extensions in config files are merged with (not replacing) these defaults.
 */

/**
 * Default extension to language ID mapping
 * Covers all common programming languages
 */
export const DEFAULT_EXTENSIONS: Record<string, string> = {
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
