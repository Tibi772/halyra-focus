'use strict';
// "How hard is it to turn blocking off?" — the three modes.
//   flexible: stop instantly (the user always stays in charge)
//   patient:  stop after a short countdown (breaks the impulse, Pluckeye-style delay)
//   strict:   locked until the timer ends; an emergency exit still exists:
//             type a random text by hand AND wait out a longer delay.

const CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeChallenge(length, rng = Math.random) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    if (i > 0 && i % 6 === 0) out += ' ';
    out += CHARS[Math.floor(rng() * CHARS.length)];
  }
  return out;
}

class Unlocker {
  constructor({ now = () => Date.now(), rng = Math.random } = {}) {
    this.now = now;
    this.rng = rng;
    this.pending = null;
  }

  status() {
    if (!this.pending) return null;
    const t = this.now();
    if (t > this.pending.expiresAt) { this.pending = null; return null; }
    return { kind: this.pending.kind, readyAt: this.pending.readyAt, expiresAt: this.pending.expiresAt, challenge: this.pending.challenge || null };
  }

  request(mode, opts) {
    const t = this.now();
    if (mode === 'flexible') { this.pending = null; return { status: 'ready' }; }
    if (mode === 'patient') {
      const existing = this.status();
      if (existing && existing.kind === 'wait') return { status: 'wait', readyAt: existing.readyAt, expiresAt: existing.expiresAt };
      const readyAt = t + opts.patientDelaySec * 1000;
      this.pending = { kind: 'wait', readyAt, expiresAt: readyAt + 120000 };
      return { status: 'wait', readyAt, expiresAt: this.pending.expiresAt };
    }
    return { status: 'locked' };
  }

  emergency(opts) {
    const existing = this.status();
    if (existing && existing.kind === 'challenge') return { status: 'challenge', readyAt: existing.readyAt, challenge: existing.challenge };
    const t = this.now();
    const readyAt = t + opts.emergencyDelaySec * 1000;
    const challenge = makeChallenge(opts.challengeLength || 120, this.rng);
    this.pending = { kind: 'challenge', readyAt, expiresAt: readyAt + 30 * 60000, challenge };
    return { status: 'challenge', readyAt, challenge };
  }

  confirm(mode, { challenge } = {}) {
    if (mode === 'flexible') return true;
    const p = this.status();
    if (!p) return false;
    const t = this.now();
    if (t < p.readyAt) return false;
    if (mode === 'patient' && (p.kind === 'wait' || p.kind === 'challenge')) {
      if (p.kind === 'challenge' && challenge !== p.challenge) return false;
      this.pending = null;
      return true;
    }
    if (mode === 'strict' && p.kind === 'challenge' && typeof challenge === 'string' && challenge === p.challenge) {
      this.pending = null;
      return true;
    }
    return false;
  }

  cancel() {
    this.pending = null;
  }
}

module.exports = { Unlocker, makeChallenge };
