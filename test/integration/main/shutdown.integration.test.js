/**
 * Integration tests for shutdown functionality
 * Tests the actual server process with real signals
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
describe('Shutdown Integration', () => {
    it('should terminate gracefully on SIGINT within timeout', async () => {
        // Skip this test if typescript-language-server is not available
        try {
            const testProcess = spawn('which', ['typescript-language-server']);
            await new Promise((resolve, reject) => {
                testProcess.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error('typescript-language-server not found'));
                    }
                    else {
                        resolve(void 0);
                    }
                });
            });
        }
        catch {
            console.warn('Skipping integration test: typescript-language-server not available');
            return;
        }
        const serverPath = path.resolve(process.cwd(), 'dist/index.js');
        // Spawn the server process
        const serverProcess = spawn('node', [serverPath]);
        let stderr = '';
        if (serverProcess.stdout) {
            serverProcess.stdout.on('data', (data) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                void data.toString(); // Process stdout data (currently unused but received)
            });
        }
        if (serverProcess.stderr) {
            serverProcess.stderr.on('data', (data) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                stderr += data.toString();
            });
        }
        // Give the server a moment to start up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const startTime = Date.now();
        // Send SIGINT to trigger graceful shutdown
        const killResult = serverProcess.kill('SIGINT');
        expect(killResult).toBe(true);
        // Wait for the process to exit
        const exitPromise = new Promise((resolve) => {
            serverProcess.on('exit', (code, signal) => {
                resolve({ code, signal });
            });
        });
        // Race against a timeout to ensure it doesn't hang
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Server did not exit within 6 seconds'));
            }, 6000);
        });
        try {
            const result = await Promise.race([exitPromise, timeoutPromise]);
            const exitTime = Date.now() - startTime;
            // Verify the server exited gracefully
            expect(result.code).toBe(0);
            expect(exitTime).toBeLessThan(6000); // Should exit within 6 seconds
            console.log(`Server exited gracefully in ${exitTime}ms`);
            console.log(`Exit code: ${result.code}, Signal: ${result.signal}`);
            if (stderr) {
                console.log('Stderr output:', stderr);
            }
        }
        catch (error) {
            // Force kill if still running
            if (!serverProcess.killed) {
                serverProcess.kill('SIGKILL');
            }
            throw error;
        }
    }, 10000); // 10 second test timeout
    it('should handle SIGTERM gracefully', async () => {
        // Skip this test if typescript-language-server is not available
        try {
            const testProcess = spawn('which', ['typescript-language-server']);
            await new Promise((resolve, reject) => {
                testProcess.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error('typescript-language-server not found'));
                    }
                    else {
                        resolve(void 0);
                    }
                });
            });
        }
        catch {
            console.warn('Skipping integration test: typescript-language-server not available');
            return;
        }
        const serverPath = path.resolve(process.cwd(), 'dist/index.js');
        const serverProcess = spawn('node', [serverPath]);
        // Give the server a moment to start up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const startTime = Date.now();
        // Send SIGTERM to trigger graceful shutdown
        const killResult = serverProcess.kill('SIGTERM');
        expect(killResult).toBe(true);
        // Wait for the process to exit
        const exitPromise = new Promise((resolve) => {
            serverProcess.on('exit', (code, signal) => {
                resolve({ code, signal });
            });
        });
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Server did not exit within 6 seconds'));
            }, 6000);
        });
        try {
            const result = await Promise.race([exitPromise, timeoutPromise]);
            const exitTime = Date.now() - startTime;
            expect(result.code).toBe(0);
            expect(exitTime).toBeLessThan(6000);
            console.log(`Server exited gracefully on SIGTERM in ${exitTime}ms`);
        }
        catch (error) {
            if (!serverProcess.killed) {
                serverProcess.kill('SIGKILL');
            }
            throw error;
        }
    }, 10000);
});
