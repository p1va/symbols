/**
 * File lifecycle management - public API
 */

// Runtime values (functions) exported directly
export {
  openFileWithStrategy,
  closeFileWithStrategy,
  executeWithExplicitLifecycle,
  executeWithCursorContext,
} from './manager.js';

// Types re-exported so downstream modules can import them without bringing
// them into the runtime export object – prevents "module does not provide"
// errors when the code is executed via `tsx`.
export type {
  FileLifecycleStrategy,
  FileOpenResult,
  OperationWithContextResult,
} from './manager.js';

// Re-export some ops for advanced use cases
export { forceCloseFile } from './ops.js';
