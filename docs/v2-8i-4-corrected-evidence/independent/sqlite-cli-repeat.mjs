import { discoveryProcessContract } from '../../../test/v2-turn-discovery-process-contract.js';
import { discoveryScenario } from '../../../test/v2-turn-discovery-fixture.js';
discoveryProcessContract('SQLite', discoveryScenario);
