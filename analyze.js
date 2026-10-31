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
    judge: J => { const a = angle(J.sh, J.elbow, J.wrist), arm = Math.hypot(J.sh.x - J.elbow.x, J.sh.y - J.elbow.y) + Math.hypot(J.elbow.x - J.wrist.x, J.elbow.y - J.wrist.y), up = (J.sh.y - J.wrist.y) / arm; return { pass: a >= 150 || up >= .8, stats: { '위 지점 팔꿈치 각도': a, '상체 기울기': lean(J.sh, J.hip) } }; } },
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
  const J = frames.map(joints), legs = J.map(j => Math.hypot(j.hip.x - j.knee.x, j.hip.y - j.knee.y) + Math.hypot(j.knee.x - j.ankle.x, j.knee.y - j.ankle.y)), leg = median(legs);
  const fps = (times.length - 1) / (times[times.length - 1] - times[0]), secs = times[times.length - 1] - times[0];
  // 다리 길이로 나눠서 사람이 멀어지거나 카메라가 움직여도 값이 흔들리지 않게 한다.
  const sw = smooth(frames.map((p, i) => (p[27].x - p[28].x) / legs[i]), 1), mid = mean(sw), z = sw.map(v => v - mid);
  const corr = lag => { let n = 0, d = 0; for (let i = 0; i + lag < z.length; i++) { n += z[i] * z[i + lag]; d += z[i] * z[i]; } return d ? n / d : 0; };
  let best = 0, score = -1;
  // 한 걸음 주기는 0.25~0.45초. 좌우 교대라 왼발 기준 한 주기는 그 두 배다.
  for (let lag = Math.round(.5 * fps); lag <= Math.round(.9 * fps); lag++) { const c = corr(lag); if (c > score) { score = c; best = lag; } }
  const stride = best / fps, cadence = best ? 120 / stride : 0;
  const hips = frames.map((p, i) => (p[23].y + p[24].y) / 2 / legs[i]), w = Math.max(2, Math.round(stride * fps / 4)), base = smooth(hips, w * 2), bob = hips.map((y, i) => y - base[i]);
  const cycles = []; for (let i = 0; i + best / 2 < bob.length; i += Math.max(1, Math.round(best / 2))) { const seg = bob.slice(i, i + Math.round(best / 2) + 1); cycles.push(Math.max(...seg) - Math.min(...seg)); }
  const bounce = (cycles.length ? median(cycles) : 0) * 100;
  const half = Math.max(1, Math.round(best / 2)), gaps = []; for (let i = 0; i + half < z.length; i++) if (z[i] * z[i + 1] < 0) gaps.push(i);
  const step = gaps.slice(1).map((v, i) => (v - gaps[i]) / fps).filter(g => g > .15 && g < .7), odd = step.filter((_, i) => i % 2), even = step.filter((_, i) => !(i % 2));
  const balance = odd.length && even.length ? Math.abs(mean(odd) - mean(even)) / mean(step) * 100 : 0;
  const torso = median(J.map(j => lean(j.sh, j.hip)));
  const ahead = frames.map((p, i) => Math.max(Math.abs(p[27].x - p[23].x), Math.abs(p[28].x - p[24].x)) / legs[i]).sort((x, y) => x - y), reach = ahead[Math.floor(ahead.length * .9)];
  const lift = frames.map(p => Math.max(lean(p[23], p[25]), lean(p[24], p[26]))).sort((x, y) => x - y), knee = lift[Math.floor(lift.length * .9)];
  const elbow = median(J.map(j => angle(j.sh, j.elbow, j.wrist)));
  const hTop = frames.map(p => Math.max(p[27].y, p[28].y) - p[0].y), bodyH = median(hTop), spread = Math.sqrt(mean(legs.map(l => (l - leg) ** 2))) / leg;
  const steps = Math.round(cadence / 60 * secs), jump = J.slice(1).filter((j, i) => Math.hypot(j.hip.x - J[i].hip.x, j.hip.y - J[i].hip.y) > leg * .6).length;
  return { kind: 'run', cadence, torso, reach, secs, balance, bounce, knee, elbow, steps, rhythm: score, bodyH, spread, cuts: jump, bob: smooth(bob, 1).map(v => v * 100), visibility: vis(frames, [11, 23, 25, 27]) };
}
export function measure(frames, times, key) {
  const ex = EX[key];
  if (ex.peak === 'run') return running(frames, times);
  const J = frames.map(joints), sign = ex.peak === 'low' ? 1 : -1, s = smooth(J.map(j => sign * ex.sig(j)));
  const size = median(J.map(j => Math.hypot(j.sh.x - j.hip.x, j.sh.y - j.hip.y)));
  // 전체 폭 대신 봉우리별 돌출 높이로 찾는다. 일어서기 같은 자세 전환이 섞여도 반복을 놓치지 않는다.
  const peaks = [];
  for (let i = 1; i < s.length; i++) {
    if (s[i] < s[i - 1] || (i < s.length - 1 && s[i] <= s[i + 1])) continue;
    let l = s[i], r = s[i], j = i - 1, k = i + 1;
    for (; j >= 0 && s[j] <= s[i]; j--) l = Math.min(l, s[j]);
    for (; k < s.length && s[k] <= s[i]; k++) r = Math.min(r, s[k]);
    // 영상 끝에서 잘린 쪽은 비교에서 뺀다. 첫 회차나 마지막 회차를 놓치지 않기 위해서다.
    const sides = [...(j >= 0 ? [l] : []), ...(k < s.length ? [r] : [])], base = sides.length ? Math.max(...sides) : Math.min(l, r), p = s[i] - base;
    if (p >= size * .2) peaks.push({ i, p: j < 0 && k >= s.length ? Math.max(s[i] - l, s[i] - r) : p });
  }
  const typical = peaks.length ? median(peaks.map(p => p.p)) : 0, kept = [];
  for (const p of peaks.filter(p => p.p >= typical * .5)) {
    const last = kept[kept.length - 1];
    if (last && times[p.i] - times[last.i] < .6) { if (p.p > last.p) kept[kept.length - 1] = p; } else kept.push(p);
  }
  // 내려간 채 영상이 끝나면 올라오는 동작이 없어 회차로 세지 않는다.
  if (ex.peak === 'low' && kept.length > 1) { const z = kept[kept.length - 1]; if (s[z.i] - Math.min(...s.slice(z.i)) < z.p * .5) kept.pop(); }
  const reps = kept.map(({ i, p }, q) => {
    const stop = s[i] - p * .85, floor = q ? kept[q - 1].i : 0, ceil = q < kept.length - 1 ? kept[q + 1].i : s.length - 1;
    let a = i, b = i;
    while (a > floor && s[a] > stop) a--;
    while (b < ceil && s[b] > stop) b++;
    return { start: a, peak: i, end: b };
  });
  const range = (typical || Math.max(...s) - Math.min(...s)) / size;
  let cuts = 0; for (let i = 1; i < J.length; i++) if (Math.hypot(J[i].hip.x - J[i - 1].hip.x, J[i].hip.y - J[i - 1].hip.y) > size * .8) cuts++;
  for (const r of reps) {
    const c = { hipY: mean(J.slice(r.peak - 1, r.peak + 2).map(j => j.hip.y)), kneeY: mean(J.slice(r.peak - 1, r.peak + 2).map(j => j.knee.y)) };
    Object.assign(r, ex.judge(J[r.peak], c)); r.go = times[r.peak] - times[r.start]; r.back = times[r.end] - times[r.peak]; r.t = times[r.peak];
  }
  return { kind: 'rep', reps, visibility: vis(frames, [11, 23, 25, 27]), range, cuts };
}
const statLine = rs => { const o = {}; Object.keys(rs[0].stats).forEach(k => { o[k] = median(rs.map(r => r.stats[k])); }); return o; };
export function interpret(m, key) {
  const ex = EX[key], fail = { ok: false, headline: '분석하기 어려운 영상입니다', tip: `${ex.guide} 다시 찍어 주세요.` };
  if (m.kind === 'run') {
    if (m.cuts >= 2) return { ok: false, headline: '여러 장면이 이어진 영상입니다', tip: `편집 없이 한 번에 찍은 영상을 올려 주세요. ${ex.guide}.` };
    if (m.tooSmall) return { ok: false, headline: '사람이 너무 작게 찍혔습니다', tip: '화면 높이의 절반 이상이 되도록 가까이서 찍어 주세요.' };
    if (m.visibility < .6 || m.secs < 3 || m.rhythm < .35 || m.spread > .25) return { ok: false, headline: '달리는 리듬을 읽지 못했습니다', tip: `${ex.guide}, 일정한 속도로 달리는 장면을 찍어 주세요.` };
    const seed = Math.round(m.cadence * 3 + m.torso * 7 + m.reach * 100), pick = (a, n) => a[(seed * 31 + n * 17) % a.length];
    const k = m.cadence < 165 ? 'slow' : m.cadence > 190 ? 'quick' : 'good', k2 = m.reach > .55 ? 'reach' : m.torso > 15 ? 'lean' : m.bounce > 12 ? 'bounce' : 'ok';
    const kind = m.bounce > 12 ? '통통 튀는 러너' : m.reach > .55 ? '보폭형 러너' : m.cadence >= 175 ? '잰걸음 러너' : '안정형 러너';
    const goal = m.cadence < 175 ? `다음 목표: 같은 페이스로 케이던스 ${Math.round(m.cadence * 1.05)}` : k2 === 'bounce' ? `다음 목표: 위아래 움직임 ${(m.bounce - 1).toFixed(1)}% 이하` : `다음 목표: 지금 수치를 유지하며 거리 늘리기`;
    return { ok: true, run: true, name: ex.name, main: m.cadence, mainLabel: '케이던스', headline: pick(RUN.head[k], 1), why: pick(RUN.why[k2], 2), type: `러너 유형 후보: ${kind}`, tip: pick(RUN.tip[k2 === 'ok' ? k : k2], 3), plan: `${goal}. ${pick(RUN.plan, 4)}`, big: `${m.cadence.toFixed(0)}`, bigLabel: '걸음/분', kind, bob: m.bob, stats: [[`${m.cadence.toFixed(0)}`, '케이던스(걸음/분)'], [`${m.bounce.toFixed(1)}%`, '위아래 움직임(다리 길이 대비)'], [`${m.balance.toFixed(1)}%`, '좌우 리듬 차이'], [`${m.torso.toFixed(0)}°`, '상체 기울기'], [`${(m.reach * 100).toFixed(0)}%`, '앞다리 뻗음'], [`${m.knee.toFixed(0)}°`, '무릎 들림'], [`${m.elbow.toFixed(0)}°`, '팔꿈치 각도'], [`약 ${m.steps}걸음`, '분석 걸음 수']] };
  }
  const r = m.reps; if (m.cuts >= 2) return { ok: false, headline: '여러 장면이 이어진 영상입니다', tip: `편집 없이 한 번에 찍은 영상을 올려 주세요. ${ex.guide}.` };
  if (m.visibility < .6 || r.length < 1) return fail;
  const n = r.length, pass = r.filter(x => x.pass).length, ups = r.map(x => ex.peak === 'low' ? x.back : x.go), go = mean(r.map(x => ex.peak === 'low' ? x.go : x.back)), up = mean(ups);
  const firstUp = mean(ups.slice(0, Math.ceil(n / 2))), slowRep = ups.indexOf(Math.max(...ups)) + 1, tired = n >= 3 && Math.max(...ups) / firstUp >= 1.15;
  const primary = Object.keys(r[0].stats).pop(), vals = r.map(x => x.stats[primary]), steady = Math.max(...vals) - Math.min(...vals) <= 12, s = statLine(r);
  const seed = Math.round(n * 7 + up * 100 + go * 31 + vals[0] * 3), pick = (a, x) => a[(seed * 31 + x * 17) % a.length];
  const k1 = pass === n ? (steady ? 'steadyAll' : 'allVary') : pass >= n / 2 ? 'some' : 'shallow';
  const k2 = tired ? 'fatigue' : go < .6 ? 'fast' : 'even', k3 = pass < n ? 'range' : tired ? 'endurance' : !steady || go < .6 ? 'control' : 'progress';
  const bat = w => (w.charCodeAt(w.length - 1) - 44032) % 28 > 0, J2 = { '를': ['을', '를'], '가': ['이', '가'], '는': ['은', '는'], '와': ['과', '와'] };
  const g = t => t.replace(/\{g\}([를가는와])?/g, (_, j) => ex.goal + (j ? J2[j][bat(ex.goal) ? 0 : 1] : ''));
  return { ok: true, name: ex.name, main: pass / n * 100, mainLabel: `${ex.goal} 달성률`, headline: g(pick(STEP1[k1], 1)), why: g(pick(STEP2[k2], 2)) + (tired ? ` 가장 느린 회차는 ${slowRep}회차입니다.` : ''), type: `${ex.name} ${n}회`, tip: g(pick(STEP3[k3], 3)), plan: g(pick(PLAN[k3], 4)), ups, slowRep, big: `${pass}/${n}`, bigLabel: `${ex.goal} 달성`, stats: [[`${n}회`, '반복'], [`${pass}/${n}`, `${ex.goal} 달성`], [`${go.toFixed(2)}초`, '내리는 시간'], [`${up.toFixed(2)}초`, '힘쓰는 시간'], ...Object.entries(s).map(([k, v]) => [`${v.toFixed(0)}°`, k])] };
}
export function compare(hist, ex, out) {
  const prev = [...hist].reverse().find(h => h.ex === ex); if (!prev) return '첫 기록입니다. 같은 조건으로 다시 찍으면 변화를 보여 줍니다.';
  const d = out.main - prev.v, days = Math.max(1, Math.round((Date.now() - prev.d) / 864e5));
  return `${days}일 전보다 ${out.mainLabel} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
}
export function bodyTrend(log) {
  if (log.length < 2) return log.length ? '첫 기록을 저장했습니다.' : '입력은 선택입니다. 저장하면 날짜별로 쌓입니다.';
  const a = log[0], b = log[log.length - 1], parts = [`${log.length}회 기록`];
  [['w', '몸무게', 'kg'], ['m', '골격근량', 'kg'], ['f', '체지방률', '%']].forEach(([k, n, u]) => { if (a[k] && b[k]) { const d = b[k] - a[k]; parts.push(`${n} ${d >= 0 ? '+' : ''}${d.toFixed(1)}${u}`); } });
  return parts.join(', ');
}
