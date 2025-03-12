/**
 * Simple logging utility for Canvas Format Brush plugin
 * Allows controlling log output based on settings
 */

export class Logger {
    private isDebugMode: boolean;

    constructor(isDebugMode = false) {
        this.isDebugMode = isDebugMode;
    }

    setDebugMode(isDebugMode: boolean): void {
        this.isDebugMode = isDebugMode;
    }

    /**
     * Log message only in debug mode
     */
    debug(message: string, ...optionalParams: any[]): void {
        if (this.isDebugMode) {
            console.log(`[CFB Debug] ${message}`, ...optionalParams);
        }
    }

    /**
     * Log important events regardless of debug mode
     */
    info(message: string, ...optionalParams: any[]): void {
        console.log(`[CFB Info] ${message}`, ...optionalParams);
    }

    /**
     * Log errors
     */
    error(message: string, ...optionalParams: any[]): void {
        console.error(`[CFB Error] ${message}`, ...optionalParams);
    }
}

export const log = new Logger();
