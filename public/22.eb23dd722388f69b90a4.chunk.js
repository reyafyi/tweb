(this.webpackJsonp=this.webpackJsonp||[]).push([[22],{113:function(t,e,s){"use strict";function a(t,e){const s=e.split(".");let a=t;return s.forEach(t=>{t&&(a=a[t])}),a}s.d(e,"a",(function(){return a}))},139:function(t,e,s){"use strict";function a(t,e){t=t.split(" ",1)[0],e=e.split(" ",1)[0];const s=t.split("."),a=e.split(".");for(let t=0;t<s.length;++t){const e=+s[t],i=+a[t];if(e>i)return 1;if(e<i)return-1}return 0}s.d(e,"a",(function(){return a}))},140:function(t,e,s){"use strict";s.d(e,"a",(function(){return n}));var a=s(52),i=s(85);function n(t,e,s,o){for(const r in t)typeof e[r]!=typeof t[r]?(e[r]=Object(a.a)(t[r]),s&&s(o||r)):Object(i.a)(t[r])&&n(t[r],e[r],s,o||r)}},17:function(t,e,s){"use strict";s.r(e),s.d(e,"STATE_INIT",(function(){return P})),s.d(e,"AppStateManager",(function(){return O}));var a=s(43),i=s(49),n=s(15),o=s(90),r=s(41),h=s(8),d=s(30),l=s(103),c=s(0),u=s(138),g=s(75),p=s(66),f=s(139);var b=s(52),m=s(113);var S=s(140),v=function(t,e,s,a){return new(s||(s=Promise))((function(i,n){function o(t){try{h(a.next(t))}catch(t){n(t)}}function r(t){try{h(a.throw(t))}catch(t){n(t)}}function h(t){var e;t.done?i(t.value):(e=t.value,e instanceof s?e:new s((function(t){t(e)}))).then(o,r)}h((a=a.apply(t,e||[])).next())}))};const y=h.a.version,_=h.a.build,P={allDialogsLoaded:{},pinnedOrders:{},contactsList:[],updates:{},filters:{},maxSeenMsgId:0,stateCreatedTime:Date.now(),recentEmoji:[],topPeersCache:{},recentSearch:[],version:y,build:_,authState:{_:c.IS_MOBILE?"authStateSignIn":"authStateSignQr"},hiddenPinnedMessages:{},settings:{messagesTextSize:16,distanceUnit:"kilometers",sendShortcut:"enter",animationsEnabled:!0,autoDownload:{photo:{contacts:!0,private:!0,groups:!0,channels:!0},video:{contacts:!0,private:!0,groups:!0,channels:!0},file:{contacts:!0,private:!0,groups:!0,channels:!0}},autoDownloadNew:{_:"autoDownloadSettings",file_size_max:3145728,pFlags:{video_preload_large:!0,audio_preload_next:!0},photo_size_max:1048576,video_size_max:15728640,video_upload_maxbitrate:100},autoPlay:{gifs:!0,videos:!0},stickers:{suggest:!0,loop:!0},emoji:{suggest:!0,big:!0},themes:[{name:"day",background:c.IS_MOBILE?{blur:!1,slug:"",color:"#dbddbb,#6ba587,#d5d88d,#88b884",highlightningColor:"hsla(86.4, 43.846153%, 45.117647%, .4)",intensity:0,id:"1"}:{blur:!1,slug:"pattern",color:"#dbddbb,#6ba587,#d5d88d,#88b884",highlightningColor:"hsla(86.4, 43.846153%, 45.117647%, .4)",intensity:50,id:"1"}},{name:"night",background:c.IS_MOBILE?{blur:!1,slug:"",color:"#0f0f0f",highlightningColor:"hsla(0, 0%, 3.82353%, 0.4)",intensity:0,id:"-1"}:{blur:!1,slug:"pattern",color:"#fec496,#dd6cb9,#962fbf,#4f5bd5",highlightningColor:"hsla(299.142857, 44.166666%, 37.470588%, .4)",intensity:-50,id:"-1"}}],theme:"system",notifications:{sound:!1},timeFormat:(new Date).toLocaleString().match(/\s(AM|PM)/)?"h12":"h23"},keepSigned:!0,chatContextMenuHintWasShown:!1,stateId:Object(p.a)(32),notifySettings:{}},w=Object.keys(P),T=["contactsList","stateCreatedTime","maxSeenMsgId","filters","topPeers"];class O extends i.a{constructor(){super(),this.log=Object(r.b)("STATE"),this.neededPeers=new Map,this.singlePeerMap=new Map,this.storages={users:new l.a(u.a,"users"),chats:new l.a(u.a,"chats"),dialogs:new l.a(u.a,"dialogs")},this.storagesResults={},this.storage=o.a,this.loadSavedState(),n.default.addEventListener("user_auth",()=>{this.requestPeerSingle(n.default.myId,"self")})}loadSavedState(){return this.loaded||(console.time("load state"),this.loaded=new Promise(t=>{const e=Object.keys(this.storages),s=e.map(t=>this.storages[t].getAll()),a=w.map(t=>o.a.get(t)).concat(g.a.get("user_auth"),g.a.get("state_id")).concat(o.a.get("user_auth")).concat(s);Promise.all(a).then(s=>v(this,void 0,void 0,(function*(){let a=this.state={};for(let t=0,e=w.length;t<e;++t){const e=w[t],i=s[t];void 0!==i?a[e]=i:this.pushToState(e,Object(b.a)(P[e]))}s.splice(0,w.length);let i=s.shift();const r=s.shift(),l=s.shift();if(!i&&l){i=l;const t=["dc","server_time_offset","xt_instance"];for(let e=1;e<=5;++e)t.push(`dc${e}_server_salt`),t.push(`dc${e}_auth_key`);const e=yield Promise.all(t.map(t=>o.a.get(t)));t.push("user_auth"),e.push("number"==typeof i||"string"==typeof i?{dcID:e[0]||h.a.baseDcId,date:Date.now()/1e3|0,id:i.toPeerId(!1)}:i);let s={};t.forEach((t,a)=>{s[t]=e[a]}),yield g.a.set(s)}i&&(a.authState={_:"authStateSignedIn"},n.default.dispatchEvent("user_auth","number"==typeof i||"string"==typeof i?{dcID:0,date:Date.now()/1e3|0,id:i.toPeerId(!1)}:i));for(let t=0,a=e.length;t<a;++t)this.storagesResults[e[t]]=s[t];if(s.splice(0,e.length),a.stateId!==r){if(void 0!==r){const t=new Map([["authState",void 0],["stateId",void 0]]);t.forEach((e,s)=>{t.set(s,Object(b.a)(a[s]))}),a=this.state=Object(b.a)(P),t.forEach((t,e)=>{a[e]=t});for(const t in this.storagesResults)this.storagesResults[t].length=0;this.storage.set(a)}yield g.a.set({state_id:a.stateId})}const c=Date.now();if(a.stateCreatedTime+864e5<c){d.b&&this.log("will refresh state",a.stateCreatedTime,c);(t=>{t.forEach(t=>{this.pushToState(t,Object(b.a)(P[t]));const e=this.storagesResults[t];e&&e.length&&(e.length=0)})})(T)}if(!a.settings.hasOwnProperty("theme")&&a.settings.hasOwnProperty("nightTheme")&&(a.settings.theme=a.settings.nightTheme?"night":"day",this.pushToState("settings",a.settings)),!a.settings.hasOwnProperty("themes")&&a.settings.background){a.settings.themes=Object(b.a)(P.settings.themes);const t=a.settings.themes.find(t=>t.name===a.settings.theme);t&&(t.background=a.settings.background,this.pushToState("settings",a.settings))}const u=a.settings.autoDownload;if(void 0!==(null==u?void 0:u.private)){const t=["contacts","private","groups","channels"];["photo","video","file"].forEach(e=>{const s=u[e]={};t.forEach(t=>{s[t]=u[t]})}),t.forEach(t=>{delete u[t]}),this.pushToState("settings",a.settings)}if(Object(S.a)(P,a,t=>{this.pushToState(t,a[t])}),a.version!==y||a.build!==_){if(-1===Object(f.a)(a.version,"0.8.7")){this.state.allDialogsLoaded=Object(b.a)(P.allDialogsLoaded),this.state.filters=Object(b.a)(P.filters);const t=this.storagesResults.dialogs;(null==t?void 0:t.length)&&(t.length=0)}if(-1===Object(f.a)(a.version,"1.3.0")){let t=!1;a.settings.themes.forEach((e,s,a)=>{if("day"===e.name&&"ByxGo2lrMFAIAAAAmkJxZabh8eM"===e.background.slug&&"image"===e.background.type||"night"===e.name&&"#0f0f0f"===e.background.color&&"color"===e.background.type){const i=P.settings.themes.find(t=>t.name===e.name);i&&(a[s]=Object(b.a)(i),t=!0)}}),t&&this.pushToState("settings",a.settings)}0!==Object(f.a)(a.version,y)&&(this.newVersion=y),this.pushToState("version",y),this.pushToState("build",_)}n.default.settings=a.settings,d.b&&this.log("state res",a,Object(b.a)(a)),console.timeEnd("load state"),t(a)}))).catch(t)})),this.loaded}getState(){return void 0===this.state?this.loadSavedState():Promise.resolve(this.state)}setByKey(t,e){!function(t,e,s){const a=e.split(".");Object(m.a)(t,a.slice(0,-1).join("."))[a.pop()]=s}(this.state,t,e),n.default.dispatchEvent("settings_updated",{key:t,value:e});const s=t.split(".")[0];this.pushToState(s,this.state[s])}pushToState(t,e,s=!0){s&&(this.state[t]=e),this.setKeyValueToStorage(t,e)}setKeyValueToStorage(t,e=this.state[t]){this.storage.set({[t]:e})}requestPeer(t,e,s){let a=this.neededPeers.get(t);a&&a.has(e)||(a||(a=new Set,this.neededPeers.set(t,a)),a.add(e),this.dispatchEvent("peerNeeded",t),void 0!==s&&this.keepPeerSingle(t,e))}requestPeerSingle(t,e,s=t){return this.requestPeer(t,e+"_"+s,1)}releaseSinglePeer(t,e){return this.keepPeerSingle(a.c,e+"_"+t)}isPeerNeeded(t){return this.neededPeers.has(t)}keepPeerSingle(t,e){const s=this.singlePeerMap.get(e);if(s&&s!==t&&this.neededPeers.has(s)){const t=this.neededPeers.get(s);t.delete(e),t.size||(this.neededPeers.delete(s),this.dispatchEvent("peerUnneeded",s))}t?this.singlePeerMap.set(e,t):this.singlePeerMap.delete(e)}}O.STATE_INIT=P;const I=new O;d.a.appStateManager=I;e.default=I}}]);
//# sourceMappingURL=22.eb23dd722388f69b90a4.chunk.js.map