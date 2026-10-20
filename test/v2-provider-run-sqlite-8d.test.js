import { scenario } from './v2-runtime-fixture.js';
import { providerRunContract } from './v2-provider-run-contract.js';
providerRunContract('SQLite', scenario);
