import { STEP1, STEP2, STEP3, PLAN } from './bank.js';
// 관절 좌표 배열에서 지표를 계산하고, 규칙표로 해석한다. AI 호출 없음.
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
const smooth = (v, k = 3) => v.map((_, i) => mean(v.slice(Math.max(0, i - k), i + k + 1)));
const deg = r => r * 180 / Math.PI;
function angle(a, b, c) {
  const x1 = a.x - b.x, y1 = a.y - b.y, x2 = c.x - b.x, y2 = c.y - b.y, d = Math.hypot(x1, y1) * Math.hypot(x2, y2);
  return d ? deg(Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / d)))) : 0;
}
const vis = (fr, ids) => mean(fr.flatMap(p => ids.map(i => p[i].visibility ?? 1)));

export function measure(frames, times) {
  const L = [11, 23, 25, 27, 29, 31], R = [12, 24, 26, 28, 30, 32];
  const [sh, hp, kn, an] = vis(frames, L) >= vis(frames, R) ? L : R;
  const hip = smooth(frames.map(p => p[hp].y)), kneeY = smooth(frames.map(p => p[kn].y));
  const knee = smooth(frames.map(p => angle(p[hp], p[kn], p[an])));
  const shoulder = smooth(frames.map(p => p[sh].x));
  const top = Math.min(...hip), bot = Math.max(...hip), range = bot - top, thr = top + range * .55, near = top + range * .12;
  const reps = []; let i = 0;
  while (i < hip.length) {
    if (hip[i] > thr) {
      let j = i, lo = i;
      while (j < hip.length && hip[j] > thr) { if (hip[j] > hip[lo]) lo = j; j++; }
      let s = lo, e = lo;
      while (s > 0 && hip[s] > near) s--;
      while (e < hip.length - 1 && hip[e] > near) e++;
      if (!reps.length || times[lo] - times[reps[reps.length - 1].low] > .8) reps.push({ start: s, low: lo, end: e });
      i = j;
    } else i++;
  }
  const legLen = median(frames.map(p => Math.hypot(p[hp].x - p[kn].x, p[hp].y - p[kn].y) + Math.hypot(p[kn].x - p[an].x, p[kn].y - p[an].y)));
  for (const r of reps) {
    const p = frames[r.low];
    r.down = times[r.low] - times[r.start]; r.up = times[r.end] - times[r.low]; r.knee = knee[r.low];
    r.below = hip[r.low] > kneeY[r.low];
    r.torso = Math.abs(deg(Math.atan2(p[sh].x - p[hp].x, p[hp].y - p[sh].y)));
    r.shin = Math.abs(deg(Math.atan2(p[kn].x - p[an].x, p[an].y - p[kn].y)));
    const seg = shoulder.slice(r.start, r.end + 1); r.sway = (Math.max(...seg) - Math.min(...seg)) / legLen;
  }
  return { reps, visibility: vis(frames, [sh, hp, kn, an]), range: range / legLen };
}

export function interpret(m) {
  const r = m.reps;
  if (m.visibility < .6 || m.range < .15 || r.length < 2) return { ok: false, headline: '분석하기 어려운 영상입니다', tip: '옆에서 머리부터 발끝까지 나오게 다시 찍어 주세요.' };
  const n = r.length, below = r.filter(x => x.below).length, ups = r.map(x => x.up), up = mean(ups), down = mean(r.map(x => x.down));
  const firstUp = mean(ups.slice(0, Math.ceil(n / 2))), slowRep = ups.indexOf(Math.max(...ups)) + 1, slowRatio = Math.max(...ups) / firstUp;
  const kneeSpread = Math.max(...r.map(x => x.knee)) - Math.min(...r.map(x => x.knee));
  const torso = median(r.map(x => x.torso)), shin = median(r.map(x => x.shin));
  const steady = kneeSpread <= 10;
  const seed = Math.round(n * 7 + up * 100 + down * 31 + torso * 3 + shin * 5 + kneeSpread * 11);
  const pick = (arr, salt) => arr[(seed * 31 + salt * 17) % arr.length];
  const k1 = below === n ? (steady ? 'steadyAll' : 'allVary') : below >= n / 2 ? 'some' : 'shallow';
  const tired = slowRatio >= 1.15, fastDown = down < .8, lean = torso > 35;
  const k2 = tired ? 'fatigue' : lean ? 'lean' : fastDown ? 'fast' : 'even';
  const k3 = below < n ? 'depth' : tired ? 'endurance' : lean ? 'brace' : !steady || fastDown ? 'control' : 'progress';
  const type = (shin >= 28 ? '무릎을 앞으로 보내는 ' : '엉덩이를 뒤로 보내는 ') + (torso <= 30 ? '곧은 자세형' : '상체를 숙이는 자세형');
  const obs = pick(STEP2[k2], 2) + (tired ? ` 가장 느린 회차는 ${slowRep}회차입니다.` : '');
  return { ok: true, n, below, up, down, torso, shin, kneeSpread, slowRep, headline: pick(STEP1[k1], 1), why: obs, type: `자세 유형 후보: ${type}`, tip: pick(STEP3[k3], 3), plan: pick(PLAN[k3], 4), ups };
}

export function bodyTrend(log) {
  if (log.length < 2) return '기록이 쌓이면 변화를 보여 줍니다.';
  const a = log[0], b = log[log.length - 1], dw = b.w - a.w, dm = b.m && a.m ? b.m - a.m : null;
  const t = `${log.length}회 기록, 몸무게 ${dw >= 0 ? '+' : ''}${dw.toFixed(1)}kg`;
  return dm === null ? t : `${t}, 골격근량 ${dm >= 0 ? '+' : ''}${dm.toFixed(1)}kg`;
}
