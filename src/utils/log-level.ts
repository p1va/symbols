/**
 * Convert log level numbers to readable names
 */
export function getLogLevelName(type: number): string {
  switch (type) {
    case 1:
      return 'Error';
    case 2:
      return 'Warning';
    case 3:
      return 'Info';
    case 4:
      return 'Log';
    default:
      return 'Unknown';
  }
}
