/* KWARS2 SAVE SYSTEM  (window.KW2Save)
   Contract §10. Versioned envelope, KWARS2-only namespace, hash-validated,
   current/backup/checkpoint like KWARS1 -- but NEVER sharing its keys.

   Legacy migration (directive §23): the prototype wrote its castle to
   `aow2_castle` and a view preference to `kwars2_view_locked`. Both are
   imported ONCE into canonical state. The legacy keys are deliberately LEFT IN
   PLACE for rollback safety; we simply stop writing new production state to
   them. */
(function(){
  'use strict';
  const PREFIX='kwars2-save-v1-', SCHEMA=1;
  const LEGACY_CASTLE='aow2_castle', LEGACY_VIEW='kwars2_view_locked';

  function hash(t){let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
  function envelope(ns,payload){
    const body={namespace:ns,schemaVersion:SCHEMA,edition:'KWARS2',
      appVersion:(window.KW2Build&&window.KW2Build.appVersion)||'dev',
      updatedAt:new Date().toISOString(),payload};
    return {...body,payloadHash:hash(JSON.stringify(body))};
  }
  function valid(e,ns){
    if(!e||e.namespace!==ns||!e.payloadHash)return false;
    const c={...e};delete c.payloadHash;
    return hash(JSON.stringify(c))===e.payloadHash;
  }
  const key=(ns,s)=>PREFIX+ns+'-'+s;

  function write(ns,payload,checkpoint){
    try{
      const next=envelope(ns,payload), cur=localStorage.getItem(key(ns,'current'));
      localStorage.setItem(key(ns,'temp'),JSON.stringify(next));
      if(!valid(JSON.parse(localStorage.getItem(key(ns,'temp'))),ns))throw Error('checksum');
      if(cur)localStorage.setItem(key(ns,'backup'),cur);
      localStorage.setItem(key(ns,'current'),JSON.stringify(next));
      if(checkpoint)localStorage.setItem(key(ns,'checkpoint'),JSON.stringify(next));
      localStorage.removeItem(key(ns,'temp'));
      return {ok:true,source:'current'};
    }catch(err){ return {ok:false,error:String(err)}; }
  }
  function read(ns){
    for(const src of ['current','backup','checkpoint']){
      try{
        const e=JSON.parse(localStorage.getItem(key(ns,src))||'null');
        if(valid(e,ns))return {ok:true,payload:e.payload,source:src};
      }catch(err){}
    }
    return {ok:false,payload:null,source:null};
  }
  function remove(ns){for(const s of ['current','backup','checkpoint','temp'])localStorage.removeItem(key(ns,s));}

  /* ---- one-time legacy import ---- */
  function migrateLegacy(){
    const done=read('meta').payload;
    if(done&&done.legacyImported)return {ran:false,reason:'already-imported'};
    const out={imported:[],skipped:[]};
    try{
      const raw=localStorage.getItem(LEGACY_CASTLE);
      if(raw){
        const castle=JSON.parse(raw);
        // validate before importing: a malformed legacy blob must not poison state
        if(castle&&typeof castle==='object'){ write('castle',{castle},true); out.imported.push(LEGACY_CASTLE); }
        else out.skipped.push(LEGACY_CASTLE+':invalid');
      }
    }catch(e){ out.skipped.push(LEGACY_CASTLE+':unparseable'); }
    try{
      const v=localStorage.getItem(LEGACY_VIEW);
      if(v!==null){ out.imported.push(LEGACY_VIEW); out.viewLocked=(v==='1'); }
    }catch(e){}
    write('meta',{legacyImported:true,importedAt:new Date().toISOString(),detail:out},true);
    return {ran:true,...out};
  }

  window.KW2Save=Object.freeze({write,read,remove,validate:valid,hash,migrateLegacy,
    schemaVersion:SCHEMA,PREFIX,LEGACY_CASTLE,LEGACY_VIEW});
})();
