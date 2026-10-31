import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { measure, interpret, bodyTrend } from './analyze.js';
const $ = i => document.getElementById(i), STEP = 1 / 12, MAX = 60;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
let lm;
async function ready() {
  if (lm) return lm;
  $('st').textContent = '분석 도구를 준비합니다. 처음 한 번만 걸립니다.';
  const fs = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  lm = await PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .3, minTrackingConfidence: .3 });
  return lm;
}
const seek = (v, t) => new Promise(r => { v.onseeked = r; v.currentTime = t; });
async function run(src) {
  const v = $('v'); $('res').hidden = true; $('pg').hidden = false; $('pg').value = 0;
  try {
    const l = await ready();
    v.src = src; await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('이 영상 형식을 열 수 없습니다.')); });
    const dur = Math.min(v.duration, MAX), frames = [], times = [], t0 = performance.now(), cv = document.createElement('canvas'), sc = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc); const cx = cv.getContext('2d', { willReadFrequently: true });
    for (let t = 0, k = 0; t < dur; t += STEP, k++) {
      await seek(v, t);
      cx.drawImage(v, 0, 0, cv.width, cv.height);
      const r = l.detectForVideo(cv, Math.round(t * 1000));
      if (r.landmarks?.[0]) { frames.push(r.landmarks[0].map(p => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight, visibility: p.visibility }))); times.push(t); }
      if (k % 6 === 0) { $('pg').value = t / dur * 100; $('st').textContent = `분석 중 ${Math.round(t / dur * 100)}%`; }
    }
    if (frames.length < 10) throw new Error('사람을 찾지 못했습니다. 전신이 나오게 찍어 주세요.');
    const m = measure(frames, times), out = interpret(m);
    window.__result = { ...out, vis: m.visibility, range: m.range, nreps: m.reps.length, sec: (performance.now() - t0) / 1000, frames: frames.length };
    show(out); $('st').textContent = v.duration > MAX ? '앞의 60초만 분석했습니다.' : '분석을 마쳤습니다.';
  } catch (e) { $('st').textContent = e.message; window.__result = { error: e.message }; } finally { $('pg').hidden = true; }
}
function show(o) {
  $('res').hidden = false; $('headline').textContent = o.headline; $('tip').textContent = o.tip; $('plan').textContent = o.plan || ''; $('type').textContent = o.type || ''; $('why').textContent = o.why || '';
  const grid = $('stats'), bars = $('bars'), card = $('card'); grid.textContent = ''; bars.textContent = ''; card.hidden = !o.ok;
  if (!o.ok) return;
  [[`${o.n}회`, '반복'], [`${o.below}/${o.n}`, '평행 아래'], [`${o.down.toFixed(2)}초`, '내림 평균'], [`${o.up.toFixed(2)}초`, '올림 평균'], [`${o.torso.toFixed(0)}°`, '바닥 상체 기울기'], [`${o.shin.toFixed(0)}°`, '바닥 정강이 기울기']].forEach(([a, b]) => { const d = document.createElement('div'); d.className = 'stat'; const x = document.createElement('b'); x.textContent = a; const y = document.createElement('span'); y.textContent = b; d.append(x, y); grid.append(d); });
  const mx = Math.max(...o.ups); o.ups.forEach((u, i) => { const b = document.createElement('i'); b.style.height = u / mx * 100 + '%'; if (i + 1 === o.slowRep) b.className = 'hot'; bars.append(b); });
  const c = card.getContext('2d'); c.fillStyle = '#10202a'; c.fillRect(0, 0, 1080, 1080); c.textAlign = 'center';
  c.fillStyle = '#ffb03c'; c.font = 'bold 150px Malgun Gothic,sans-serif'; c.fillText(`${o.below}/${o.n}`, 540, 330);
  c.fillStyle = '#eef3f4'; c.font = 'bold 60px Malgun Gothic,sans-serif'; c.fillText('평행 아래 스쿼트', 540, 430);
  c.font = '44px Malgun Gothic,sans-serif'; c.fillStyle = '#7be6ff'; c.fillText(o.type.replace('자세 유형 후보: ', ''), 540, 560);
  c.fillStyle = '#a8bac2'; c.font = '40px Malgun Gothic,sans-serif'; c.fillText(`내림 ${o.down.toFixed(2)}초 · 올림 ${o.up.toFixed(2)}초`, 540, 680); c.fillText('폼 기록실', 540, 960);
}
$('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) run(URL.createObjectURL(f)); });
const load = () => { try { return JSON.parse(localStorage.getItem('body') || '[]'); } catch { return []; } };
const paint = () => { $('body').textContent = bodyTrend(load()); };
$('save').addEventListener('click', () => { const w = +$('w').value, m = +$('m').value; if (!w) return; const l = load(); l.push({ d: Date.now(), w, m: m || null }); try { localStorage.setItem('body', JSON.stringify(l)); } catch {} paint(); });
paint();
