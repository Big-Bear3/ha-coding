import { existsSync, mkdirSync, createWriteStream, type WriteStream } from 'fs';
import { join } from 'path';

type LogLevel = 'info' | 'warn' | 'error';

const INTERNAL_PATTERNS = [
    '/services/logger-service',
    '/actions/on-change',
    '/actions/on-switch',
    '/actions/on-detect',
    '/actions/on-keep',
    '/actions/stage'
];

class LoggerService {
    static #instance: LoggerService;

    #logsDir: string;
    #currentDate: string;
    #writeStream: WriteStream;

    private constructor() {
        this.#logsDir = join(process.cwd(), 'logs');
        try {
            if (!existsSync(this.#logsDir)) mkdirSync(this.#logsDir, { recursive: true });
        } catch {}
    }

    info(...args: any[]): void {
        this.log('info', false, ...args);
    }

    warn(...args: any[]): void {
        this.log('warn', false, ...args);
    }

    error(...args: any[]): void {
        this.log('error', false, ...args);
    }

    print(...args: any[]): void {
        this.log('info', true, ...args);
    }

    printWarn(...args: any[]): void {
        this.log('warn', true, ...args);
    }

    printError(...args: any[]): void {
        this.log('error', true, ...args);
    }

    mark(desc: string): void {/*  */
        if (!currentLogContext) return;
        this.info(`[${currentLogContext.tag}:${desc}] ${formatValue(currentLogContext.oldVal)} → ${formatValue(currentLogContext.newVal)}`);
    }

    private log(level: LogLevel, toConsole: boolean, ...args: any[]): void {
        const timeStr = this.getTimeStr();
        const levelTag = level.toUpperCase();
        const message = args.map(formatValue).join(' ');
        const line = `[${timeStr}] [${levelTag}] ${message}`;

        this.writeToFile(line);

        if (toConsole) {
            const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            consoleFn(line);
        }
    }

    private writeToFile(line: string): void {
        try {
            const dateStr = this.getDateStr();
            if (dateStr !== this.#currentDate) {
                if (this.#writeStream) this.#writeStream.end();
                this.#currentDate = dateStr;
                this.#writeStream = createWriteStream(join(this.#logsDir, `${dateStr}.log`), { flags: 'a' });
            }
            this.#writeStream.write(line + '\n');
        } catch {}
    }

    private getDateStr(): string {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private getTimeStr(): string {
        const d = new Date();
        const date = this.getDateStr();
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return `${date} ${time}`;
    }

    static get instance(): LoggerService {
        if (!LoggerService.#instance) LoggerService.#instance = new LoggerService();
        return LoggerService.#instance;
    }
}

export const logger = LoggerService.instance;

export function formatValue(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

export function getCallerInfo(): string {
    const stack = new Error().stack;
    if (!stack) return '';

    const lines = stack.split('\n').slice(1);
    for (const line of lines) {
        if (INTERNAL_PATTERNS.some((p) => line.includes(p))) continue;

        const match = line.match(/\(?(.+?):(\d+):\d+\)?$/);
        if (match) {
            return shortenPath(match[1]) + ':' + match[2];
        }
    }
    return '';
}

function shortenPath(rawPath: string): string {
    let p = rawPath.replace(/^file:\/\/\//, '').replace(/\\/g, '/');

    const distIdx = p.indexOf('.dist/');
    if (distIdx !== -1) {
        p = p.substring(distIdx + 6);
        if (p.startsWith('src/')) p = p.substring(4);
    }

    return p.replace(/\.js$/, '.ts');
}

interface LogContext {
    tag: string;
    newVal: unknown;
    oldVal: unknown;
}

let currentLogContext: LogContext = null;

export function setLogContext(context: LogContext): void {
    currentLogContext = context;
}

export function clearLogContext(): void {
    currentLogContext = null;
}
