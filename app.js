import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { EX, joints, measure, interpret, bodyTrend } from './analyze.js';
const $ = i => document.getElementById(i), STEP = 1 / 12, MAX = 60, CY = '#7be6ff', OR = '#ffb03c', BG = 'rgba(10,22,34,.82)';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [11, 13], [13, 15], [12, 14], [14, 16]];
let lm, key = 'squat', S = null;
Object.entries(EX).forEach(([k, e]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e.name; b.onclick = () => pickEx(k); b.dataset.k = k; $('chips').append(b); });
function pickEx(k) { key = k; document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); $('guide').textContent = `촬영: ${EX[k].guide}. 10~20초가 좋습니다.`; }
pickEx('squat');
async function ready() {
  if (lm) return lm;
  $('st').textContent = '분석 도구를 준비합니다. 처음 한 번만 걸립니다.';
  const fs = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  lm = await PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .3, minTrackingConfidence: .3 });
  return lm;
}
const seek = (v, t) => new Promise(r => { v.onseeked = r; v.currentTime = t; });
let clock = 0;
async function run(src) {
  const v = $('v'); $('res').hidden = true; $('replay').hidden = true; $('dl').hidden = true; $('pg').hidden = false; $('pg').value = 0;
  try {
    const l = await ready();
    v.src = src; await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('이 영상 형식을 열 수 없습니다.')); });
    const dur = Math.min(v.duration, MAX), frames = [], times = [], t0 = performance.now(), cv = document.createElement('canvas'), sc = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc); const cx = cv.getContext('2d', { willReadFrequently: true });
    for (let t = 0, k = 0; t < dur; t += STEP, k++) {
      await seek(v, t); cx.drawImage(v, 0, 0, cv.width, cv.height);
      clock += 84; const r = l.detectForVideo(cv, clock);
      if (r.landmarks?.[0]) { frames.push(r.landmarks[0].map(p => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight, visibility: p.visibility }))); times.push(t); }
      if (k % 6 === 0) { $('pg').value = t / dur * 100; $('st').textContent = `분석 중 ${Math.round(t / dur * 100)}%`; }
    }
    if (frames.length < 10) throw new Error('사람을 찾지 못했습니다. 전신이 나오게 찍어 주세요.');
    const m = measure(frames, times, key), out = interpret(m, key); S = { frames, times, m, out, key };
    window.__result = { ...out, sec: (performance.now() - t0) / 1000, frames: frames.length, reps: m.reps?.length, vis: m.visibility, range: m.range };
    show(out); if (out.ok) { $('replay').hidden = false; await seek(v, 0); paint(0); }
    $('st').textContent = v.duration > MAX ? '앞의 60초만 분석했습니다.' : '분석을 마쳤습니다.';
  } catch (e) { $('st').textContent = e.message; window.__result = { error: e.message }; } finally { $('pg').hidden = true; }
}
function paint(t) {
  const v = $('v'), c = $('view'), scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight)), W = Math.round(v.videoWidth * scale), H = Math.round(v.videoHeight * scale);
  if (c.width !== W) { c.width = W; c.height = H; }
  const x = c.getContext('2d'); x.drawImage(v, 0, 0, W, H);
  const { times, frames, m, key: k } = S; let i = 0; while (i < times.length - 1 && times[i + 1] <= t) i++;
  const p = frames[i], u = Math.min(W, H) / 22; x.lineCap = 'round'; x.strokeStyle = CY; x.lineWidth = Math.max(3, u / 6);
  BONES.forEach(([a, b]) => { if (p[a].visibility > .4 && p[b].visibility > .4) { x.beginPath(); x.moveTo(p[a].x * scale, p[a].y * scale); x.lineTo(p[b].x * scale, p[b].y * scale); x.stroke(); } });
  x.fillStyle = OR; [23, 24, 25, 26, 27, 28, 11, 12, 13, 14, 15, 16].forEach(j => { if (p[j].visibility > .4) { x.beginPath(); x.arc(p[j].x * scale, p[j].y * scale, Math.max(4, u / 4), 0, 7); x.fill(); } });
  const J = joints(p), [lbl, val] = EX[k].live(J), done = m.kind === 'rep' ? m.reps.filter(r => r.t <= t).length : 0, bw = (W - u * 2) / 3, bh = u * 3;
  const box = (ix, title, text, col) => { const bx = u / 2 + ix * (bw + u / 2); x.fillStyle = BG; x.fillRect(bx, u / 2, bw, bh); x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(bx, u / 2, bw, bh); x.fillStyle = col; x.font = `bold ${u * .75}px sans-serif`; x.textAlign = 'left'; x.fillText(title, bx + u / 3, u * 1.45); x.fillStyle = '#fff'; x.font = `bold ${u * 1.35}px sans-serif`; x.fillText(text, bx + u / 3, u * 3); };
  box(0, 'TIME', t.toFixed(2), CY); box(1, m.kind === 'rep' ? 'REP' : 'CADENCE', m.kind === 'rep' ? `${done}/${m.reps.length}` : m.cadence.toFixed(0), OR); box(2, lbl, `${val.toFixed(0)}°`, CY);
  const tag = `${EX[k].name} LOCK`; x.font = `bold ${u * .85}px sans-serif`; const tw = x.measureText(tag).width + u * .8, tx = Math.min(W - tw - u / 2, Math.max(u / 2, J.hip.x * scale + u)), ty = Math.max(u * 5.2, J.hip.y * scale); x.fillStyle = BG; x.fillRect(tx, ty - u * 1.6, tw, u * 1.4); x.strokeStyle = OR; x.strokeRect(tx, ty - u * 1.6, tw, u * 1.4); x.fillStyle = OR; x.fillText(tag, tx + u * .4, ty - u * .55);
  if (m.kind === 'rep') { const y0 = H - u * 3.4; x.fillStyle = BG; x.fillRect(u / 2, y0, W - u, u * 2.9); const n = m.reps.length, g = (W - u * 2) / n, mx = Math.max(...S.out.ups); m.reps.forEach((r, q) => { if (r.t > t) return; const h = S.out.ups[q] / mx * u * 2.2; x.fillStyle = q + 1 === S.out.slowRep ? OR : CY; x.fillRect(u + q * g, y0 + u * 2.6 - h, g * .7, h); }); }
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = `${u * .6}px sans-serif`; x.textAlign = 'right'; x.fillText('폼 기록실', W - u / 2, H - u / 4); x.textAlign = 'left';
}
function playThrough(onEnd) {
  const v = $('v'); v.currentTime = 0; v.play();
  const tick = () => { paint(v.currentTime); if (v.ended || v.paused) { onEnd?.(); return; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
$('play').onclick = () => playThrough();
$('rec').onclick = () => {
  const c = $('view'); if (!c.captureStream || !window.MediaRecorder) { $('recst').textContent = '이 브라우저는 영상 저장을 지원하지 않습니다. 크롬이나 사파리에서 열어 주세요.'; return; }
  const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)), rec = new MediaRecorder(c.captureStream(30), { mimeType: type }), parts = [];
  rec.ondataavailable = e => parts.push(e.data);
  rec.onstop = () => { const b = new Blob(parts, { type }), a = $('dl'); a.href = URL.createObjectURL(b); a.download = `폼기록실.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.hidden = false; $('recst').textContent = '영상이 준비됐습니다.'; };
  $('recst').textContent = '영상을 만드는 중입니다. 재생이 끝날 때까지 기다려 주세요.'; rec.start(); playThrough(() => rec.stop());
};
function show(o) {
  $('res').hidden = false; $('headline').textContent = o.headline; $('tip').textContent = o.tip; $('plan').textContent = o.plan || ''; $('type').textContent = o.type || ''; $('why').textContent = o.why || '';
  const grid = $('stats'), bars = $('bars'), card = $('card'); grid.textContent = ''; bars.textContent = ''; card.hidden = !o.ok; $('barwrap').hidden = !o.ups;
  if (!o.ok) return;
  o.stats.forEach(([a, b]) => { const d = document.createElement('div'); d.className = 'stat'; const x = document.createElement('b'); x.textContent = a; const y = document.createElement('span'); y.textContent = b; d.append(x, y); grid.append(d); });
  if (o.ups) { const mx = Math.max(...o.ups); o.ups.forEach((u, i) => { const b = document.createElement('i'); b.style.height = u / mx * 100 + '%'; if (i + 1 === o.slowRep) b.className = 'hot'; bars.append(b); }); }
  const c = card.getContext('2d'); c.fillStyle = '#10202a'; c.fillRect(0, 0, 1080, 1080); c.textAlign = 'center';
  c.fillStyle = OR; c.font = 'bold 150px Malgun Gothic,sans-serif'; c.fillText(o.big, 540, 330);
  c.fillStyle = '#eef3f4'; c.font = 'bold 60px Malgun Gothic,sans-serif'; c.fillText(`${o.name} ${o.bigLabel}`, 540, 430);
  c.font = '44px Malgun Gothic,sans-serif'; c.fillStyle = CY; c.fillText(o.headline, 540, 560); c.fillStyle = '#a8bac2'; c.fillText('폼 기록실', 540, 960);
}
$('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) run(URL.createObjectURL(f)); });
const load = () => { try { return JSON.parse(localStorage.getItem('body') || '[]'); } catch { return []; } };
const trend = () => { $('body').textContent = bodyTrend(load()); };
$('save').addEventListener('click', () => { const w = +$('w').value, m = +$('m').value; if (!w) return; const l = load(); l.push({ d: Date.now(), w, m: m || null }); try { localStorage.setItem('body', JSON.stringify(l)); } catch {} trend(); });
trend();
if (location.hostname === 'localhost') { const u = new URLSearchParams(location.search); if (u.get('ex')) pickEx(u.get('ex')); if (u.get('test')) fetch(u.get('test')).then(r => r.blob()).then(b => run(URL.createObjectURL(b))); }
