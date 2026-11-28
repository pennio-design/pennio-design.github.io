/* Renders scene.html (or SCENE=scene-v1.html) to an MP4: node render.js out.mp4
   Needs Playwright, ffmpeg, and the site served on :3000 (python3 -m http.server 3000 from the repo root).
   Steps scene.html's render(t) frame by frame at 30 fps, pipes the frames to ffmpeg, and muxes the soundtrack made by audio.py. */
const { chromium } = require('playwright'), { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const out = path.resolve(process.argv[2] || 'pennio-campaign-reel.mp4'), base = process.env.BASE || 'http://localhost:3000';
const FPS = 30, tmpWav = path.join(os.tmpdir(), 'pennio-reel.wav');
execFileSync('python3', [path.join(__dirname, 'audio.py'), tmpWav], { stdio: 'inherit' });
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto(base + '/reel-studio/campaign-reel/' + (process.env.SCENE || 'scene.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  const dur = await p.evaluate(() => window.DURATION), frames = Math.round(dur * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', tmpWav,
    '-t', String(dur), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-af', 'lowpass=f=14000,volume=0.72', '-c:a', 'aac', '-b:a', '224k', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < frames; i++) {
    await p.evaluate(t => window.render(t), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
  console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
})();
