import { postgresWorkerContracts } from './v2-turn-worker-postgres-fixture.js';
import { turnWorkerContract } from './v2-turn-worker-contract.js';
await postgresWorkerContracts(turnWorkerContract);
