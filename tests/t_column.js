const { makeEl, buildCtx, vm, fs } = require('./harness.js');

function run(label, touched, values) {
  const ids = ['schema','tableName','colName','logicalName','dataType','dataLength','dataPrecision',
               'dataScale','pkYn','ukYn','fkYn','nullableYn','defaultValue','description','pciYn',
               'pciCategoryCd','sensitivityCd','encryptionYn','encryptionAlg','maskingYn',
               'maskingRuleCd','retentionPeriodCd','tosCd','statusCd'];
  const els = { 'change-reason': makeEl('change-reason', {value:'테스트 변경 사유 십자 이상'}),
                'global-emp-id': makeEl('global-emp-id', {value:'1234567'}) };
  const checks = ['pkYn','ukYn','fkYn','nullableYn','pciYn','encryptionYn','maskingYn'];
  const sels   = ['dataType','pciCategoryCd','sensitivityCd','maskingRuleCd','retentionPeriodCd','statusCd'];
  for (const f of ids) {
    const isChk = checks.includes(f), isSel = sels.includes(f);
    const e = makeEl(`col-mod-${f}`, { type: isChk ? 'checkbox' : 'text',
                                       tagName: isSel ? 'SELECT' : 'INPUT' });
    if (f === 'dataType') e.value = 'VARCHAR2';        // 셀렉트 첫 값(기본 표시)
    if (f === 'sensitivityCd') e.value = 'HIGH';       // 셀렉트 첫 값(기본 표시)
    if (values[f] !== undefined) { if (isChk) e.checked = values[f]; else e.value = values[f]; }
    if (touched.includes(f)) e.dataset.touched = '1';
    els[`col-mod-${f}`] = e;
  }
  els['col-mod-schema'].value = 'SVC1';
  els['col-mod-tableName'].value = 'TB_PAY';
  els['col-mod-colName'].value = 'AMOUNT';

  const { ctx, out } = buildCtx(els);
  ctx.document.querySelector = () => ({ id: 'col-mod' });
  vm.runInContext(fs.readFileSync('js/column.js','utf8') + '\nthis.CT = ColumnTab;', ctx);
  ctx.CT.generate();
  console.log(`\n───── ${label} ─────`);
  if (out.errors) { console.log('검증 차단:', out.errors.join(' | ')); return; }
  console.log(out.sql.split('\n').filter(l => l.trim() && !l.startsWith('-- ─')).join('\n'));
}

run('A. 길이만 수정 (타입 미선택) — 차단되어야 함', ['dataLength'], { dataLength: '50' });
run('B. 타입+길이 함께 수정 — MODIFY 정상',          ['dataType','dataLength'], { dataType:'VARCHAR2', dataLength:'200' });
run('C. PCI 체크만 ON — 메타만, MODIFY 없어야 함',   ['pciYn'], { pciYn: true });
run('D. 아무것도 안 건드림 — 차단되어야 함',          [], {});
run('E. 상태를 비운 채 건드림 — 차단되어야 함',       ['statusCd'], { statusCd: '' });
