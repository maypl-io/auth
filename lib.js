'use strict';

const fs = require('fs');
const path = require('path');

const POLL_MS = 500;
const DEFAULT_WAIT_MS = 120_000;
function command(out, name, message) {
    const escaped = String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    out(`::${name}::${escaped}\n`);
}

function readVerdict(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            return null;
        }
        throw e;
    }
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function writeKey(file, key) {
    if (fs.existsSync(file)) {
        return;
    }
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
    fs.writeFileSync(temporary, key, {mode: 0o600});
    fs.renameSync(temporary, file);
}
function report(out, verdict) {
    if (verdict.outcome === 'accepted') {
        out('maypl: accepted\n');
        return 0;
    }
    command(out, 'error', verdict.message || 'maypl refused this job');
    return 1;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run({env = process.env, waitMs, out = s => process.stdout.write(s)} = {}) {
    const keyFile = env.MAYPL_KEY_FILE;
    const verdictFile = env.MAYPL_VERDICT_FILE;
    if (!keyFile || !verdictFile) {
        out('maypl: skipped\n');
        return 0;
    }
    const decided = readVerdict(verdictFile);
    if (decided) {
        return report(out, decided);
    }
    const key = (env.INPUT_TOKEN || '').trim();
    if (key) {
        command(out, 'add-mask', key);
    } else {
        out('maypl: empty token\n');
    }
    writeKey(keyFile, key);
    const limit = waitMs ?? (Number(env.MAYPL_AUTH_WAIT_MS) || DEFAULT_WAIT_MS);
    const until = Date.now() + limit;
    while (Date.now() < until) {
        const verdict = readVerdict(verdictFile);
        if (verdict) {
            return report(out, verdict);
        }
        await sleep(POLL_MS);
    }
    command(out, 'error', `maypl didn't answer within ${Math.round(limit / 1000)} s`);
    return 1;
}

module.exports = {run};
