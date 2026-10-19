import { scenario } from './v2-runtime-fixture.js';
import { providerContract } from './v2-provider-contract.js';
providerContract('SQLite',t=>scenario(t));
