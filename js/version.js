/* =========================================================
 * 앱 버전 — 루트 VERSION 파일과 반드시 일치해야 한다.
 *
 * 손으로 고치지 말 것. ./build/bump-version.sh <버전> 이 이 값과
 * VERSION, index.html 의 ?v= 를 한꺼번에 갱신한다.
 * 어긋난 채로는 ./build/package.sh 가 빌드를 거부한다.
 *
 * 폐쇄망에서는 zip 파일명이 사라진 뒤 화면의 이 값이 유일한 식별 수단이라
 * 파일 하나로 분리해 둔다.
 * ========================================================= */

const APP_VERSION = '1.5.0';

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('brand-version');
  if (el) el.textContent = `meta_query_gen / v${APP_VERSION}`;
});
