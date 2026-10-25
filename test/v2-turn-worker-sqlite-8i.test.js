import { scenario } from './v2-runtime-fixture.js';
import { turnWorkerContract } from './v2-turn-worker-contract.js';
turnWorkerContract('SQLite', scenario);
