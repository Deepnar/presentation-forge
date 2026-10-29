let epoch=0,last;
function token() {try{return typeof localStorage==='undefined'?null:localStorage.getItem('forge.token');}catch{return null;}}
export function projectSessionSnapshot() {
  const value=token();if(value!==last){last=value;epoch++;}
  return {token:value,epoch};
}
if(typeof window!=='undefined') {
  window.addEventListener('forge:project-session',()=>{epoch++;last=token();});
  window.addEventListener('storage',event=>{if(event.key==='forge.token'||event.key===null){epoch++;last=token();}});
}
export function announceProjectSession() {
  if(typeof window!=='undefined')window.dispatchEvent(new Event('forge:project-session'));
}
