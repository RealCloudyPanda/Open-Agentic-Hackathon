import { manifestAllowsPeer } from '/runtime/engine.js';
import { consumeRemoteBudget } from '/runtime/runner.js';
import { AgentNetwork, validateNetwork } from '/runtime/kernel.js';
export function boundaryDrills() {
  const composition = { deadline: Date.now() + 1000, remoteCalls: 0, maxRemoteCalls: 1, maxCallsPerPeer: 1, peerCalls: new Map() };
  const first = consumeRemoteBudget(composition, 'fixture-one');
  const second = consumeRemoteBudget(composition, 'fixture-two');
  const invalid = validateNetwork(new AgentNetwork({ tools: [] }, 'empty_fixture'));
  return [
    { name: 'Denied origin', passed: !manifestAllowsPeer('https://denied.example/network', { allowed_peers: [] }), detail: 'Actual runtime policy rejects an undeclared peer.' },
    { name: 'Incompatible network', passed: invalid.errors.length > 0, detail: invalid.errors.join('; ') },
    { name: 'Remote-call budget', passed: first === null && !!second, detail: second },
  ];
}
if (typeof document !== 'undefined' && document.querySelector('#drills')) {
  document.querySelector('#run-drills').onclick = () => { document.querySelector('#drills').textContent = JSON.stringify(boundaryDrills(), null, 2); };
}
