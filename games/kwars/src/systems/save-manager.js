(function(){
  'use strict';
  const PREFIX='kw-save-v2-',SCHEMA=3;
  function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
  function envelope(namespace,payload){const body={namespace,schemaVersion:SCHEMA,appVersion:window.KWBuild?.appVersion||'unknown',contentVersion:window.KWBuild?.contentVersion||'unknown',updatedAt:new Date().toISOString(),payload};const serialized=JSON.stringify(body);return{...body,payloadHash:hash(serialized)};}
  function valid(e,namespace){if(!e||e.namespace!==namespace||!e.payloadHash)return false;const copy={...e};delete copy.payloadHash;return hash(JSON.stringify(copy))===e.payloadHash;}
  function key(ns,suffix){return PREFIX+ns+'-'+suffix;}
  function mirror(ns,e){if(!window.indexedDB)return;const req=window.indexedDB.open('kingdom-wars',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('saves'))req.result.createObjectStore('saves');};req.onsuccess=()=>{const tx=req.result.transaction('saves','readwrite');tx.objectStore('saves').put(e,ns);};}
  function write(namespace,payload,checkpoint){try{const next=envelope(namespace,payload),current=localStorage.getItem(key(namespace,'current'));localStorage.setItem(key(namespace,'temp'),JSON.stringify(next));const parsed=JSON.parse(localStorage.getItem(key(namespace,'temp')));if(!valid(parsed,namespace))throw Error('checksum validation failed');if(current)localStorage.setItem(key(namespace,'backup'),current);localStorage.setItem(key(namespace,'current'),JSON.stringify(next));if(checkpoint)localStorage.setItem(key(namespace,'checkpoint'),JSON.stringify(next));localStorage.removeItem(key(namespace,'temp'));mirror(namespace,next);return{ok:true,source:'current',updatedAt:next.updatedAt};}catch(error){window.KWAnalytics?.track('save_failed',{namespace,error:String(error)},'critical');return{ok:false,error:String(error)};}}
  /* The five-age game (schema < 3) numbered civilizations 1..5; the 15-civilization game keeps their places on the
     timeline (Stone, Classical, Medieval, Gunpowder, Industrial). Run state lives in payload.active (or, in raw legacy
     saves, at the top level); the flag makes the remap idempotent. */
  const LEGACY_MAP=[1,4,9,12,15];
  function remapFiveAge(st){
    if(!st||typeof st!=='object'||st.migratedFromFiveAge||st.civ==null)return st;
    const old=Math.max(1,Math.min(5,Number(st.civ)||1)),oldE=Math.max(1,Math.min(5,Number(st.enemyCiv)||old));
    return {...st,civ:LEGACY_MAP[old-1],enemyCiv:LEGACY_MAP[oldE-1],legacyCyberUnlocked:old===5||!!st.legacyCyberUnlocked,migratedFromFiveAge:true};
  }
  /* Sequential, idempotent transforms: 1 -> 2 (content version), 2 -> 3 (five ages -> fifteen civilizations).
     A schema-3 envelope is returned untouched. */
  function migrate(e){
    if(!e||typeof e!=='object')return e;
    const from=e.schemaVersion||1;
    if(from>=SCHEMA)return e;
    if(from<2)e={...e,schemaVersion:2,contentVersion:e.contentVersion||window.KWBuild?.contentVersion};
    if(from<3){
      let p=e.payload;
      if(p&&typeof p==='object'){ p={...p}; if(p.civ!=null)p=remapFiveAge(p); if(p.active&&typeof p.active==='object')p.active=remapFiveAge(p.active); }
      e={...e,schemaVersion:3,payload:p};
    }
    const copy={...e};delete copy.payloadHash;e.payloadHash=hash(JSON.stringify(copy));return e;
  }
  /* Integrity is checked on the envelope AS STORED, before any migration (migrate() re-seals, so checking afterwards
     accepted any parseable corruption and never fell back to the backup). A current-schema save must verify; an
     old-schema save that fails only the seal is accepted in a last lenient pass so an old hashing quirk can never
     cost a player their progress. */
  function read(namespace){
    const parsed={};for(const source of ['current','backup','checkpoint']){try{parsed[source]=JSON.parse(localStorage.getItem(key(namespace,source))||'null');}catch(error){parsed[source]=null;}}
    for(const lenient of [false,true])for(const source of ['current','backup','checkpoint']){
      const raw=parsed[source];if(!raw||typeof raw!=='object'||raw.namespace!==namespace)continue;
      const old=(raw.schemaVersion||1)<SCHEMA;
      if(!lenient&&!valid(raw,namespace)&&!(old&&!raw.payloadHash))continue;
      if(lenient&&!old)continue;
      try{const e=migrate(raw);if(valid(e,namespace)){if(source!=='current'||lenient)window.KWAnalytics?.track('save_recovered',{namespace,source,lenient},'critical');return{ok:true,payload:e.payload,source,meta:e};}}catch(error){}
    }
    return{ok:false,payload:null,source:null};
  }
  function remove(namespace){for(const s of ['current','backup','checkpoint','temp'])localStorage.removeItem(key(namespace,s));}
  window.KWSave=Object.freeze({write,read,remove,validate:valid,hash,migrate,remapFiveAge,schemaVersion:SCHEMA});
})();
