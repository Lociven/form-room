// 관절 좌표에서 종목별 지표를 계산하고 문장표로 해석한다. AI 호출 없음.
import { STEP1, STEP2, STEP3, PLAN, RUN } from './bank.js';
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
const smooth = (v, k = 2) => v.map((_, i) => mean(v.slice(Math.max(0, i - k), i + k + 1)));
const deg = r => r * 180 / Math.PI;
export function angle(a, b, c) {
  const x1 = a.x - b.x, y1 = a.y - b.y, x2 = c.x - b.x, y2 = c.y - b.y, d = Math.hypot(x1, y1) * Math.hypot(x2, y2);
  return d ? deg(Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / d)))) : 0;
}
const lean = (top, bottom) => Math.abs(deg(Math.atan2(top.x - bottom.x, bottom.y - top.y)));
const vis = (fr, ids) => mean(fr.flatMap(p => ids.map(i => p[i].visibility ?? 1)));
export const EX = {
  squat: { name: '스쿼트', goal: '깊이', guide: '옆에서, 전신이 나오게', peak: 'low', sig: J => J.hip.y, live: J => ['무릎', angle(J.hip, J.knee, J.ankle)],
    judge: (J, c) => ({ pass: c.hipY > c.kneeY, stats: { '바닥 상체 기울기': lean(J.sh, J.hip), '바닥 정강이 기울기': lean(J.knee, J.ankle), '무릎 각도': angle(J.hip, J.knee, J.ankle) } }) },
  deadlift: { name: '데드리프트', goal: '잠금', guide: '옆에서, 바벨과 전신이 나오게', peak: 'high', sig: J => J.sh.y, live: J => ['엉덩이', angle(J.sh, J.hip, J.knee)],
    judge: J => { const a = angle(J.sh, J.hip, J.knee); return { pass: a >= 160, stats: { '위 지점 엉덩이 각도': a, '위 지점 상체 기울기': lean(J.sh, J.hip) } }; } },
  bench: { name: '벤치프레스', goal: '가동 범위', guide: '옆에서, 팔과 상체가 나오게', peak: 'low', sig: J => J.wrist.y, live: J => ['팔꿈치', angle(J.sh, J.elbow, J.wrist)],
    judge: J => { const a = angle(J.sh, J.elbow, J.wrist); return { pass: a <= 100, stats: { '바닥 팔꿈치 각도': a } }; } },
  press: { name: '오버헤드프레스', goal: '잠금', guide: '옆에서, 팔을 든 전신이 나오게', peak: 'high', sig: J => J.wrist.y, live: J => ['팔꿈치', angle(J.sh, J.elbow, J.wrist)],
    judge: J => { const a = angle(J.sh, J.elbow, J.wrist); return { pass: a >= 160, stats: { '위 지점 팔꿈치 각도': a, '상체 기울기': lean(J.sh, J.hip) } }; } },
  pushup: { name: '푸시업', goal: '깊이', guide: '옆에서, 전신이 나오게', peak: 'low', sig: J => J.sh.y, live: J => ['팔꿈치', angle(J.sh, J.elbow, J.wrist)],
    judge: J => { const a = angle(J.sh, J.elbow, J.wrist), b = angle(J.sh, J.hip, J.ankle); return { pass: a <= 100, stats: { '바닥 팔꿈치 각도': a, '몸통 일직선 각도': b } }; } },
  pullup: { name: '풀업', goal: '당기는 높이', guide: '옆이나 뒤에서, 상체와 팔이 나오게', peak: 'high', sig: J => J.sh.y, live: J => ['팔꿈치', angle(J.sh, J.elbow, J.wrist)],
    judge: J => { const a = angle(J.sh, J.elbow, J.wrist); return { pass: a <= 80, stats: { '위 지점 팔꿈치 각도': a } }; } },
  run: { name: '러닝', goal: '자세', guide: '옆에서, 5~10초 전신이 나오게', peak: 'run', live: J => ['상체', lean(J.sh, J.hip)] }
};
export function joints(p) {
  const L = [11, 13, 15, 23, 25, 27, 31], R = [12, 14, 16, 24, 26, 28, 32];
  const v = ids => mean(ids.map(i => p[i].visibility ?? 1)), S = v(L) >= v(R) ? L : R;
  return { sh: p[S[0]], elbow: p[S[1]], wrist: p[S[2]], hip: p[S[3]], knee: p[S[4]], ankle: p[S[5]], toe: p[S[6]] };
}
function running(frames, times) {
  const J = frames.map(joints), leg = median(J.map(j => Math.hypot(j.hip.x - j.knee.x, j.hip.y - j.knee.y) + Math.hypot(j.knee.x - j.ankle.x, j.knee.y - j.ankle.y)));
  const a = smooth(frames.map(p => p[27].x - p[28].x), 1); let cross = 0;
  for (let i = 1; i < a.length; i++) if (a[i - 1] * a[i] < 0 && Math.abs(a[i] - a[i - 1]) > leg * .01) cross++;
  const secs = times[times.length - 1] - times[0], cadence = cross / secs * 60;
  const torso = median(J.map(j => lean(j.sh, j.hip)));
  const ahead = frames.map(p => Math.max(Math.abs(p[27].x - p[23].x), Math.abs(p[28].x - p[24].x)) / leg);
  const reach = ahead.sort((x, y) => x - y)[Math.floor(ahead.length * .9)];
  return { kind: 'run', cadence, torso, reach, secs, visibility: vis(frames, [11, 23, 25, 27]) };
}
export function measure(frames, times, key) {
  const ex = EX[key];
  if (ex.peak === 'run') return running(frames, times);
  const J = frames.map(joints), sign = ex.peak === 'low' ? 1 : -1, s = smooth(J.map(j => sign * ex.sig(j)));
  const lo = Math.min(...s), hi = Math.max(...s), range = hi - lo, thr = lo + range * .55, near = lo + range * .12;
  const size = median(J.map(j => Math.hypot(j.sh.x - j.hip.x, j.sh.y - j.hip.y)));
  const reps = []; let i = 0;
  while (i < s.length) {
    if (s[i] > thr) {
      let j = i, pk = i;
      while (j < s.length && s[j] > thr) { if (s[j] > s[pk]) pk = j; j++; }
      let a = pk, b = pk;
      while (a > 0 && s[a] > near) a--;
      while (b < s.length - 1 && s[b] > near) b++;
      if (!reps.length || times[pk] - times[reps[reps.length - 1].peak] > .6) reps.push({ start: a, peak: pk, end: b });
      i = j;
    } else i++;
  }
  for (const r of reps) {
    const c = { hipY: mean(J.slice(r.peak - 1, r.peak + 2).map(j => j.hip.y)), kneeY: mean(J.slice(r.peak - 1, r.peak + 2).map(j => j.knee.y)) };
    Object.assign(r, ex.judge(J[r.peak], c)); r.go = times[r.peak] - times[r.start]; r.back = times[r.end] - times[r.peak]; r.t = times[r.peak];
  }
  return { kind: 'rep', reps, visibility: vis(frames, [11, 23, 25, 27]), range: range / size };
}
const statLine = rs => { const o = {}; Object.keys(rs[0].stats).forEach(k => { o[k] = median(rs.map(r => r.stats[k])); }); return o; };
export function interpret(m, key) {
  const ex = EX[key], fail = { ok: false, headline: '분석하기 어려운 영상입니다', tip: `${ex.guide} 다시 찍어 주세요.` };
  if (m.kind === 'run') {
    if (m.visibility < .6 || m.secs < 3 || m.cadence < 90) return fail;
    const seed = Math.round(m.cadence * 3 + m.torso * 7 + m.reach * 100), pick = (a, n) => a[(seed * 31 + n * 17) % a.length];
    const k = m.cadence < 165 ? 'slow' : m.cadence > 190 ? 'quick' : 'good', k2 = m.reach > .55 ? 'reach' : m.torso > 15 ? 'lean' : 'ok';
    return { ok: true, name: ex.name, headline: pick(RUN.head[k], 1), why: pick(RUN.why[k2], 2), type: `케이던스 ${m.cadence.toFixed(0)}보/분`, tip: pick(RUN.tip[k2 === 'ok' ? k : k2], 3), plan: pick(RUN.plan, 4), big: `${m.cadence.toFixed(0)}`, bigLabel: '걸음/분', stats: [[`${m.cadence.toFixed(0)}`, '케이던스'], [`${m.torso.toFixed(0)}°`, '상체 기울기'], [`${(m.reach * 100).toFixed(0)}%`, '다리 벌림 폭(다리 길이 대비)'], [`${m.secs.toFixed(0)}초`, '분석 구간']] };
  }
  const r = m.reps; if (m.visibility < .6 || m.range < .15 || r.length < 2) return fail;
  const n = r.length, pass = r.filter(x => x.pass).length, ups = r.map(x => ex.peak === 'low' ? x.back : x.go), go = mean(r.map(x => ex.peak === 'low' ? x.go : x.back)), up = mean(ups);
  const firstUp = mean(ups.slice(0, Math.ceil(n / 2))), slowRep = ups.indexOf(Math.max(...ups)) + 1, tired = Math.max(...ups) / firstUp >= 1.15;
  const primary = Object.keys(r[0].stats).pop(), vals = r.map(x => x.stats[primary]), steady = Math.max(...vals) - Math.min(...vals) <= 12, s = statLine(r);
  const seed = Math.round(n * 7 + up * 100 + go * 31 + vals[0] * 3), pick = (a, x) => a[(seed * 31 + x * 17) % a.length];
  const k1 = pass === n ? (steady ? 'steadyAll' : 'allVary') : pass >= n / 2 ? 'some' : 'shallow';
  const k2 = tired ? 'fatigue' : go < .6 ? 'fast' : 'even', k3 = pass < n ? 'range' : tired ? 'endurance' : !steady || go < .6 ? 'control' : 'progress';
  const bat = w => (w.charCodeAt(w.length - 1) - 44032) % 28 > 0, J2 = { '를': ['을', '를'], '가': ['이', '가'], '는': ['은', '는'], '와': ['과', '와'] };
  const g = t => t.replace(/\{g\}([를가는와])?/g, (_, j) => ex.goal + (j ? J2[j][bat(ex.goal) ? 0 : 1] : ''));
  return { ok: true, name: ex.name, headline: g(pick(STEP1[k1], 1)), why: g(pick(STEP2[k2], 2)) + (tired ? ` 가장 느린 회차는 ${slowRep}회차입니다.` : ''), type: `${ex.name} ${n}회`, tip: g(pick(STEP3[k3], 3)), plan: g(pick(PLAN[k3], 4)), ups, slowRep, big: `${pass}/${n}`, bigLabel: `${ex.goal} 달성`, stats: [[`${n}회`, '반복'], [`${pass}/${n}`, `${ex.goal} 달성`], [`${go.toFixed(2)}초`, '내리는 시간'], [`${up.toFixed(2)}초`, '힘쓰는 시간'], ...Object.entries(s).map(([k, v]) => [`${v.toFixed(0)}°`, k])] };
}
export function bodyTrend(log) {
  if (log.length < 2) return '기록이 쌓이면 변화를 보여 줍니다.';
  const a = log[0], b = log[log.length - 1], dw = b.w - a.w, dm = b.m && a.m ? b.m - a.m : null;
  const t = `${log.length}회 기록, 몸무게 ${dw >= 0 ? '+' : ''}${dw.toFixed(1)}kg`;
  return dm === null ? t : `${t}, 골격근량 ${dm >= 0 ? '+' : ''}${dm.toFixed(1)}kg`;
}
