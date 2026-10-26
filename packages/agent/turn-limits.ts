// Metadata reads share byte ceilings without initializing the turn validators.
export const TURN_LIMITS = Object.freeze({ privateBytes: 4*1024*1024, metadataBytes: 4*1024*1024,
  headerBytes: 16384, recordBytes: 4096, attemptBytes: 2048, turns: 128, proposals: 128,
  attempts: 1024, settlements: 128, replyChars: 16000, planBytes: 131072,
  submissionBytes:262144, turnBodyBytes:262144+16000*6+128,
  finalPrivateReservation: 262144, finalMetadataReservation: 32768 });
