import { scenario } from './v2-runtime-fixture.js';
import { postgresWorkerContracts } from './v2-turn-worker-postgres-fixture.js';
import { turnWorkerProcessContract } from './v2-turn-worker-process-contract.js';
turnWorkerProcessContract('SQLite', scenario);
await postgresWorkerContracts(turnWorkerProcessContract);
