import * as store from '../src/projects/store-postgres.js';
import { postgresWorkerContracts } from './v2-turn-worker-postgres-fixture.js';
import { discoveryScenario } from './v2-turn-discovery-fixture.js';
import { discoveryContract } from './v2-turn-discovery-contract.js';
await postgresWorkerContracts(label => discoveryContract(label, t => discoveryScenario(t, store)));
