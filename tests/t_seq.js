const { makeEl, buildCtx, vm, fs } = require('./harness.js');

function run(label, touched, values) {
  const ids = ['schema','seqName','purposeCd','usedForTable','usedForColumn',
               'incrementBy','minValue','maxValue','cacheSize','cycleYn','orderYn'];
  const checks = ['cycleYn','orderYn'];
  const els = { 'change-reason': makeEl('change-reason', {value:'시퀀스 캐시 상향 튜닝'}),
                'global-emp-id': makeEl('global-emp-id', {value:'1234567'}) };
  for (const f of ids) {
    const isChk = checks.includes(f);
    const e = makeEl(`seq-a-${f}`, { type: isChk ? 'checkbox' : 'text',
                                     tagName: f === 'purposeCd' ? 'SELECT' : 'INPUT' });
    if (f === 'incrementBy') e.value = '1';     // 폼 기본값
    if (f === 'cacheSize')   e.value = '20';    // 폼 기본값
    if (f === 'purposeCd')   e.value = 'PK';    // 셀렉트 첫 값
    if (values[f] !== undefined) { if (isChk) e.checked = values[f]; else e.value = values[f]; }
    if (touched.includes(f)) e.dataset.touched = '1';
    els[`seq-a-${f}`] = e;
  }
  els['seq-a-schema'].value = 'SVC1';
  els['seq-a-seqName'].value = 'SEQ_MEMBER_ID';

  const { ctx, out } = buildCtx(els);
  ctx.document.querySelector = () => ({ id: 'seq-alter' });
  vm.runInContext(fs.readFileSync('js/sequence.js','utf8') + '\nthis.ST = SequenceTab;', ctx);
  ctx.ST.generate();
  console.log(`\n───── ${label} ─────`);
  if (out.errors) { console.log('검증 차단:', out.errors.join(' | ')); return; }
  console.log(out.sql.split('\n').filter(l => l.trim() && !l.startsWith('-- ─'))
                      .slice(0, 14).join('\n'));
}

run('A. 캐시만 100으로 — CACHE 절만 나와야 함', ['cacheSize'], { cacheSize: '100' });
run('B. 아무것도 안 건드림 — 차단',              [], {});
run('C. 증가치를 비운 채 건드림 — 차단',          ['incrementBy'], { incrementBy: '' });
run('D. 최소값을 비운 채 건드림 — NOMINVALUE',    ['minValue'], { minValue: '' });
