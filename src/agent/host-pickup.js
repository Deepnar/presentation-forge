import { createTurnDiscovery } from '../../packages/agent/turn-discovery.ts';
import { createTurnService } from '../../packages/agent/turns.ts';
import { createTurnWorker } from '../../packages/agent/turn-worker.ts';
import { createTurnPickup } from '../../packages/agent/turn-pickup.ts';
import { createAutoHostPolicy } from './auto-host-policy.js';

export function createAutoHostPickup(backend, policy = createAutoHostPolicy()) {
  const discovery = createTurnDiscovery(backend), service = createTurnService(backend);
  return createTurnPickup({
    discover: discovery.discover, inspect: service.inspect,
    work: (binding, input, provider, options) => createTurnWorker(backend, provider).work(binding, input, options),
  }, policy);
}
