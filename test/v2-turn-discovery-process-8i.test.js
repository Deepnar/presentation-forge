import * as store from '../src/projects/store-postgres.js';
import { postgresWorkerContracts } from './v2-turn-worker-postgres-fixture.js';
import { discoveryScenario } from './v2-turn-discovery-fixture.js';
import { discoveryProcessContract } from './v2-turn-discovery-process-contract.js';
discoveryProcessContract('SQLite', discoveryScenario);
await postgresWorkerContracts(label => discoveryProcessContract(label, t => discoveryScenario(t, store)));
