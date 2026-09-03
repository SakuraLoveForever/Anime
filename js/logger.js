// Minimal leveled logger: writes to console and appends to logs/ai.log so the
// AI/cover flow can be inspected when something returns fewer results than expected.
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = process.env.DS_LOG_FILE || path.join(LOG_DIR, 'ai.log');

// Level threshold: DS_LOG_LEVEL sets the minimum level to emit.
// Defaults to 'info' (debug/internal details stay silent unless DS_LOG_LEVEL=debug).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CONFIGURED_LEVEL = Object.prototype.hasOwnProperty.call(LEVELS, process.env.DS_LOG_LEVEL)
  ? process.env.DS_LOG_LEVEL
  : 'info';

function enabled(level) {
  return LEVELS[level] >= LEVELS[CONFIGURED_LEVEL];
}

function ensureDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}
}

function write(level, msg, extras) {
  if (!enabled(level)) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${extras === undefined ? '' : ' ' + JSON.stringify(extras)}`;
  // eslint-disable-next-line no-console
  console.log(line);
  try { ensureDir(); fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
}

module.exports = {
  debug: (m, x) => write('debug', m, x),
  info: (m, x) => write('info', m, x),
  warn: (m, x) => write('warn', m, x),
  error: (m, x) => write('error', m, x),
  LOG_FILE,
};
