/**
 * File lifecycle management - public API
 */

export {
  FileLifecycleStrategy,
  FileOpenResult,
  OperationWithContextResult,
  openFileWithStrategy,
  closeFileWithStrategy,
  executeWithExplicitLifecycle,
  executeWithCursorContext,
} from './manager.js';

// Re-export some ops for advanced use cases
export { forceCloseFile } from './ops.js';
