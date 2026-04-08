/**
 * Default file extension to language ID mappings for common programming languages
 * Based on lang-identifier.md
 *
 * These defaults are a fallback language-ID catalog.
 * Configured LSP profiles should still explicitly declare which extensions they handle.
 * Direct-command mode can use this full table because it intentionally delegates file
 * compatibility decisions to the single launched server.
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
  '.C': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.H': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',

  // Additional common languages
  '.rb': 'ruby',
  '.rbw': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  '.ru': 'ruby',
  '.erb': 'erb',
  '.php': 'php',
  '.phtml': 'php',
  '.php3': 'php',
  '.php4': 'php',
  '.php5': 'php',
  '.phps': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
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

export const DEFAULT_PROFILE_EXTENSIONS: Record<
  string,
  Record<string, string>
> = {
  typescript: {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascriptreact',
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'typescriptreact',
  },
  pyright: {
    '.py': 'python',
    '.pyw': 'python',
    '.pyi': 'python',
  },
  go: {
    '.go': 'go',
  },
  rust: {
    '.rs': 'rust',
  },
  roslyn: {
    '.cs': 'csharp',
    '.cshtml': 'razor',
    '.razor': 'razor',
  },
  'vscode-roslyn': {
    '.cs': 'csharp',
    '.cshtml': 'razor',
    '.razor': 'razor',
  },
  java: {
    '.java': 'java',
  },
  clangd: {
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.C': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.H': 'cpp',
    '.hh': 'cpp',
    '.hxx': 'cpp',
  },
  kotlin: {
    '.kt': 'kotlin',
    '.kts': 'kotlin',
  },
  lua: {
    '.lua': 'lua',
  },
  php: {
    '.php': 'php',
    '.phtml': 'php',
    '.php3': 'php',
    '.php4': 'php',
    '.php5': 'php',
    '.phps': 'php',
  },
  ruby: {
    '.rb': 'ruby',
    '.rbw': 'ruby',
    '.rake': 'ruby',
    '.gemspec': 'ruby',
    '.ru': 'ruby',
    '.erb': 'erb',
  },
  swift: {
    '.swift': 'swift',
  },
};
