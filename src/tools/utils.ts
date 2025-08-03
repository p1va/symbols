/**
 * Shared utilities for tool formatting
 */

export function getSymbolKindName(kind: number): string {
  const symbolKinds: { [key: number]: string } = {
    1: 'File',
    2: 'Module',
    3: 'Namespace',
    4: 'Package',
    5: 'Class',
    6: 'Method',
    7: 'Property',
    8: 'Field',
    9: 'Constructor',
    10: 'Enum',
    11: 'Interface',
    12: 'Function',
    13: 'Variable',
    14: 'Constant',
    15: 'String',
    16: 'Number',
    17: 'Boolean',
    18: 'Array',
    19: 'Object',
    20: 'Key',
    21: 'Null',
    22: 'EnumMember',
    23: 'Struct',
    24: 'Event',
    25: 'Operator',
    26: 'TypeParameter',
  };

  return symbolKinds[kind] || 'Unknown';
}

export function formatFilePath(path: string): string {
  // Remove file:// prefix if present
  const cleanPath = path.replace('file://', '');

  // Make path relative to current working directory if it starts with it
  const cwd = process.cwd();
  if (cleanPath.startsWith(cwd)) {
    let relativePath = cleanPath.substring(cwd.length);
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    return relativePath;
  }

  return cleanPath;
}
