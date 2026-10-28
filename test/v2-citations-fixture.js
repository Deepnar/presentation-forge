export const cid = n => 'cit_'+n.toString(16).padStart(32,'0');
export const target = (elementId='text',slideId='s1') => ({kind:'element',slideId,elementId});
export const record = (n=1,overrides={}) => ({version:1,id:cid(n),target:target(),source:{projectId:'project',id:'src_'+'a'.repeat(64),generation:0},anchor:{kind:'content-sha256-v1',digest:'0'.repeat(64)},...overrides});
