import envPaths from 'env-paths';

export const APP_NAME = 'symbols';

export function getAppPaths() {
  return envPaths(APP_NAME);
}
