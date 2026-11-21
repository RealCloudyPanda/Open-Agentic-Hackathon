import { checkPeer, peerTarget } from './peer-check.js';
import * as runtime from '/runtime/index.js';
document.querySelector('#check').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = document.querySelector('#out');
  const url = document.querySelector('#url').value;
  try {
    peerTarget(url);
    out.textContent = 'Checking approved origin…';
    const report = await checkPeer(url, { runtime, contract: { sends_sly_data: ['acceptance_criteria', 'feature_title', 'platform'], requires_sly_data: ['acceptance_criteria'] } });
    out.textContent = JSON.stringify(report, null, 2);
  } catch (error) { out.textContent = error.message; }
  document.querySelector('#consent').checked = false;
});
document.querySelector('#url').addEventListener('input', () => { document.querySelector('#consent').checked = false; });
