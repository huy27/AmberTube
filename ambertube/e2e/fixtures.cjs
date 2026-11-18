// Generates the audio/LRC fixtures used by voice-lyrics-visualizer.cjs (no binaries in the repo).
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.tmpdir(), 'ambertube-e2e');
fs.mkdirSync(dir, { recursive: true });

const rate = 22050, secs = 8, n = rate * secs;
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  const v = (Math.sin((2 * Math.PI * 220 * i) / rate) + 0.5 * Math.sin((2 * Math.PI * 660 * i) / rate)) / 1.5;
  buf.writeInt16LE(Math.round(v * 12000), 44 + i * 2);
}
fs.writeFileSync(path.join(dir, 'Test Tone Song.wav'), buf);
fs.writeFileSync(path.join(dir, 'my-song.lrc'), '[ti:Paper Lanterns]\n[00:00.50]First imported line\n[00:02.00]Second imported line\n[00:04.00]Third imported line\n');
module.exports = { dir };
