/**
 * Test environment setup
 * Provides Web Crypto API and TextEncoder/TextDecoder for Node.js environment
 */

import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

// Polyfill TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
// @ts-ignore
global.TextDecoder = TextDecoder;

// Polyfill Web Crypto API
// @ts-ignore
global.crypto = webcrypto as Crypto;
