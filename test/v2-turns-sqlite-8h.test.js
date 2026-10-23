import { scenario } from './v2-runtime-fixture.js';
import { turnContract, recoveryContract, boundsContract, admissionContract, settlementContract, unicodeContract, cancellationContract } from './v2-turns-contract.js';
turnContract('SQLite',scenario);
recoveryContract('SQLite',scenario);
boundsContract('SQLite',scenario);
admissionContract('SQLite',scenario);
settlementContract('SQLite',scenario);
unicodeContract('SQLite',scenario);
cancellationContract('SQLite',scenario);
