import envPaths from 'env-paths';

const APP_NAME = 'symbols';

export function getAppPaths() {
  return envPaths(APP_NAME);
}
