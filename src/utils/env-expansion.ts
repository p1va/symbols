/**
 * Expands environment variables in a string.
 * Supports both ${VAR} and $VAR syntax (case-insensitive).
 *
 * @param str - String to expand
 * @param env - Environment object to use for expansion (defaults to process.env)
 * @returns Expanded string with environment variables replaced
 *
 * @example
 * expandEnvVars('$HOME/.config', process.env) // '/Users/john/.config'
 * expandEnvVars('${USER}_file', process.env) // 'john_file'
 */
export function expandEnvVars(
  str: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return str.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match: string, braced: string, simple: string) => {
      const varName = braced || simple;
      const value = env[varName];
      return value !== undefined ? value : match;
    }
  );
}
