/**
 * Tests for shutdown coordinator
 */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, afterEach, } from 'vitest';
import { EventEmitter } from 'node:events';
import { setupShutdown } from '../../../src/main/shutdown.js';
// Mock dependencies
const mockServer = {
    close: vi.fn().mockResolvedValue(undefined),
};
const mockLspClient = {
    connection: {
        sendRequest: vi.fn().mockResolvedValue(undefined),
        sendNotification: vi.fn(),
        onRequest: vi.fn(),
        hasPendingResponse: vi.fn().mockReturnValue(false),
        onNotification: vi.fn(),
        onUnhandledNotification: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
        onDispose: vi.fn(),
        end: vi.fn(),
        dispose: vi.fn(),
        inspect: vi.fn(),
        listen: vi.fn(),
        trace: vi.fn(),
        onProgress: vi.fn(),
        sendProgress: vi.fn(),
        onUnhandledProgress: vi.fn(),
    },
    isInitialized: true,
};
// Create a mock child process that extends EventEmitter
class MockChildProcessClass extends EventEmitter {
    killed = false;
    pid = 12345;
    kill(signal) {
        this.killed = true;
        // Simulate process exit immediately in tests
        setImmediate(() => {
            this.emit('exit', 0, signal);
        });
        return true;
    }
}
describe('Shutdown Coordinator', () => {
    let mockProcess;
    let originalProcessOn;
    let originalProcessOff;
    let originalProcessExit;
    let processOnSpy;
    let processOffSpy;
    let processExitSpy;
    beforeEach(() => {
        mockProcess = new MockChildProcessClass();
        // Mock process methods
        originalProcessOn = process.on;
        originalProcessOff = process.off;
        originalProcessExit = process.exit;
        processOnSpy = vi.fn().mockReturnValue(process);
        processOffSpy = vi.fn().mockReturnValue(process);
        processExitSpy = vi.fn(); // Mock process.exit to prevent actual exit
        process.on = processOnSpy; // Mock process.on for testing
        process.off = processOffSpy; // Mock process.off for testing
        process.exit = processExitSpy; // Mock process.exit for testing
        vi.clearAllMocks();
    });
    afterEach(() => {
        // Restore original process methods
        process.on = originalProcessOn;
        process.off = originalProcessOff;
        process.exit = originalProcessExit;
    });
    describe('setupShutdown', () => {
        it('should register SIGINT and SIGTERM handlers', () => {
            const disposer = setupShutdown(mockServer, // Mock server for testing
            mockLspClient, // Mock LSP client for testing
            mockProcess // Mock child process for testing
            );
            expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(processOnSpy).toHaveBeenCalledTimes(2);
            // Test disposer - should remove both signal handlers and LSP crash handler
            disposer();
            expect(processOffSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            expect(processOffSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(processOffSpy).toHaveBeenCalledTimes(2);
        });
        it('should initiate LSP shutdown sequence when signal handler is called', async () => {
            const disposer = setupShutdown(mockServer, // Mock server for testing
            mockLspClient, // Mock LSP client for testing
            mockProcess // Mock child process for testing
            );
            // Get the registered handler
            const sigintHandler = processOnSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1]; // Get signal handler function from mock calls
            expect(sigintHandler).toBeDefined();
            // Start the shutdown process
            sigintHandler();
            // Wait for the first part of shutdown (LSP requests) to be processed
            await new Promise((resolve) => setImmediate(resolve));
            // Verify LSP shutdown sequence was initiated - this is the key behavior we can test
            expect(mockLspClient.connection.sendRequest).toHaveBeenCalledWith('shutdown', null);
            expect(mockLspClient.connection.sendNotification).toHaveBeenCalledWith('exit', null);
            // Note: We don't test process.kill here because the await once(lspProcess, 'exit')
            // in the real shutdown function blocks further execution, but the LSP shutdown
            // sequence (which is the critical part) happens before that.
            disposer();
        });
        it('should force kill process after timeout', async () => {
            const timeoutMs = 50; // Short timeout for testing
            // Create a process that doesn't exit naturally
            const slowProcess = new MockChildProcessClass();
            slowProcess.kill = vi.fn().mockReturnValue(true); // Don't emit exit event
            const killSpy = vi.spyOn(slowProcess, 'kill');
            const disposer = setupShutdown(mockServer, // Mock server for testing
            mockLspClient, // Mock LSP client for testing
            slowProcess, // Mock slow process for timeout testing
            { timeoutMs });
            // Get the registered handler
            const sigintHandler = processOnSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1]; // Get signal handler function from mock calls
            // Call the handler
            const shutdownPromise = sigintHandler();
            // Wait for timeout to trigger
            await new Promise((resolve) => setTimeout(resolve, timeoutMs + 10));
            // Should have called kill twice: first SIGTERM, then SIGKILL
            expect(killSpy).toHaveBeenCalledWith('SIGKILL');
            // Emit exit to complete the shutdown
            slowProcess.emit('exit', 0, 'SIGKILL');
            void shutdownPromise; // Complete the shutdown promise
            disposer();
        });
        it('should handle uninitialized LSP client gracefully', () => {
            const uninitializedClient = {
                ...mockLspClient,
                isInitialized: false,
            };
            const disposer = setupShutdown(mockServer, // Mock server for testing
            uninitializedClient, // Mock uninitialized client for testing
            mockProcess // Mock child process for testing
            );
            const sigintHandler = processOnSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1]; // Get signal handler function from mock calls
            expect(sigintHandler).toBeDefined();
            expect(() => sigintHandler()).not.toThrow();
            disposer();
        });
        it('should send backup SIGTERM after LSP protocol shutdown', async () => {
            const killSpy = vi.spyOn(mockProcess, 'kill');
            const disposer = setupShutdown(mockServer, // Mock server for testing
            mockLspClient, // Mock LSP client for testing
            mockProcess // Mock child process for testing
            );
            // Get the registered handler
            const sigintHandler = processOnSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1]; // Get signal handler function from mock calls
            // Start shutdown
            sigintHandler();
            await new Promise((resolve) => setImmediate(resolve));
            // Should send SIGTERM as backup after LSP protocol shutdown
            expect(killSpy).toHaveBeenCalledWith('SIGTERM');
            disposer();
        });
        it('should detect LSP crash and initiate shutdown', async () => {
            // Create a fresh mock setup for this test to prevent interference
            const crashMockServer = { close: vi.fn().mockResolvedValue(undefined) };
            const crashMockLspClient = {
                connection: {
                    sendRequest: vi.fn().mockResolvedValue(undefined),
                    sendNotification: vi.fn(),
                },
                isInitialized: true,
            };
            const crashProcessExitSpy = vi.fn();
            const originalProcessExit = process.exit;
            process.exit = crashProcessExitSpy; // Mock process.exit for crash testing
            // Create a separate process for this test
            const crashingProcess = new MockChildProcessClass();
            // Don't auto-emit exit to avoid interference
            crashingProcess.kill = vi.fn().mockReturnValue(true);
            const disposer = setupShutdown(crashMockServer, // Mock server for crash testing
            crashMockLspClient, // Mock LSP client for crash testing
            crashingProcess // Mock crashing process for testing
            );
            // Simulate LSP crash with non-zero exit code
            crashingProcess.emit('exit', 1, null);
            await new Promise((resolve) => setImmediate(resolve));
            // Should have initiated shutdown sequence due to crash
            expect(crashMockLspClient.connection.sendRequest).toHaveBeenCalledWith('shutdown', null);
            expect(crashMockLspClient.connection.sendNotification).toHaveBeenCalledWith('exit', null);
            expect(crashProcessExitSpy).toHaveBeenCalledWith(0);
            // Restore and cleanup
            process.exit = originalProcessExit;
            disposer();
        });
        it('should not trigger crash handler for normal LSP exit', async () => {
            // Create fresh mocks for this test to avoid interference
            const freshMockServer = { close: vi.fn().mockResolvedValue(undefined) };
            const freshMockLspClient = {
                connection: {
                    sendRequest: vi.fn().mockResolvedValue(undefined),
                    sendNotification: vi.fn(),
                },
                isInitialized: true,
            };
            const freshProcessExitSpy = vi.fn();
            const originalProcessExit = process.exit;
            process.exit = freshProcessExitSpy; // Mock process.exit for normal exit testing
            // Create a process that doesn't auto-emit exit events
            const separateProcess = new MockChildProcessClass();
            // Override kill to not emit exit automatically for this test
            separateProcess.kill = vi.fn().mockReturnValue(true);
            const disposer = setupShutdown(freshMockServer, // Mock server for normal exit testing
            freshMockLspClient, // Mock LSP client for normal exit testing
            separateProcess // Mock separate process for normal exit testing
            );
            // Manually emit normal LSP exit with code 0 - should not trigger crash handler
            separateProcess.emit('exit', 0, null);
            await new Promise((resolve) => setImmediate(resolve));
            // Should not have initiated shutdown for normal exit
            expect(freshMockLspClient.connection.sendRequest).not.toHaveBeenCalled();
            expect(freshProcessExitSpy).not.toHaveBeenCalled();
            // Restore and cleanup
            process.exit = originalProcessExit;
            disposer();
        });
        it('should use exit code 1 on shutdown failure', async () => {
            // Mock LSP client to throw error during shutdown
            const errorLspClient = {
                ...mockLspClient,
                connection: {
                    sendRequest: vi
                        .fn()
                        .mockRejectedValue(new Error('LSP connection failed')),
                    sendNotification: vi.fn(),
                },
            };
            const disposer = setupShutdown(mockServer, // Mock server for testing
            errorLspClient, // Mock failing LSP client for error testing
            mockProcess // Mock child process for testing
            );
            const sigintHandler = processOnSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1]; // Get signal handler function from mock calls
            sigintHandler();
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setTimeout(resolve, 50));
            // Should exit with code 1 due to failure
            expect(processExitSpy).toHaveBeenCalledWith(1);
            disposer();
        });
    });
});
