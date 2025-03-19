import { LocalStorage } from 'node-localstorage';
import { rootDir } from './file-utils.js';

export const localStorage = new LocalStorage(rootDir + '/.localstorage', 100 * 1024 * 1024);
