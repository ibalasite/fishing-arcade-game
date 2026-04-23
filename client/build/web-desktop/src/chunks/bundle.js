System.register([], function(_export, _context) { return { execute: function () {
System.register("chunks:///_virtual/rollupPluginModLoBabelHelpers.js",[],(function(t){return{execute:function(){function r(t,r,e,n,o,i,a){try{var u=t[i](a),c=u.value}catch(t){return void e(t)}u.done?r(c):Promise.resolve(c).then(n,o)}function e(t,r){for(var e=0;e<r.length;e++){var n=r[e];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(t,u(n.key),n)}}function n(r,e){return(n=t("setPrototypeOf",Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,r){return t.__proto__=r,t}))(r,e)}function o(t,r){if(t){if("string"==typeof t)return i(t,r);var e=Object.prototype.toString.call(t).slice(8,-1);return"Object"===e&&t.constructor&&(e=t.constructor.name),"Map"===e||"Set"===e?Array.from(t):"Arguments"===e||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(e)?i(t,r):void 0}}function i(t,r){(null==r||r>t.length)&&(r=t.length);for(var e=0,n=new Array(r);e<r;e++)n[e]=t[e];return n}function a(t,r){if("object"!=typeof t||null===t)return t;var e=t[Symbol.toPrimitive];if(void 0!==e){var n=e.call(t,r||"default");if("object"!=typeof n)return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===r?String:Number)(t)}function u(t){var r=a(t,"string");return"symbol"==typeof r?r:String(r)}t({applyDecoratedDescriptor:function(t,r,e,n,o){var i={};Object.keys(n).forEach((function(t){i[t]=n[t]})),i.enumerable=!!i.enumerable,i.configurable=!!i.configurable,("value"in i||i.initializer)&&(i.writable=!0);i=e.slice().reverse().reduce((function(e,n){return n(t,r,e)||e}),i),o&&void 0!==i.initializer&&(i.value=i.initializer?i.initializer.call(o):void 0,i.initializer=void 0);void 0===i.initializer&&(Object.defineProperty(t,r,i),i=null);return i},arrayLikeToArray:i,assertThisInitialized:function(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t},asyncToGenerator:function(t){return function(){var e=this,n=arguments;return new Promise((function(o,i){var a=t.apply(e,n);function u(t){r(a,o,i,u,c,"next",t)}function c(t){r(a,o,i,u,c,"throw",t)}u(void 0)}))}},createClass:function(t,r,n){r&&e(t.prototype,r);n&&e(t,n);return Object.defineProperty(t,"prototype",{writable:!1}),t},createForOfIteratorHelperLoose:function(t,r){var e="undefined"!=typeof Symbol&&t[Symbol.iterator]||t["@@iterator"];if(e)return(e=e.call(t)).next.bind(e);if(Array.isArray(t)||(e=o(t))||r&&t&&"number"==typeof t.length){e&&(t=e);var n=0;return function(){return n>=t.length?{done:!0}:{done:!1,value:t[n++]}}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")},inheritsLoose:function(t,r){t.prototype=Object.create(r.prototype),t.prototype.constructor=t,n(t,r)},initializerDefineProperty:function(t,r,e,n){if(!e)return;Object.defineProperty(t,r,{enumerable:e.enumerable,configurable:e.configurable,writable:e.writable,value:e.initializer?e.initializer.call(n):void 0})},regeneratorRuntime:function(){
/*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */
t("regeneratorRuntime",(function(){return e}));var r,e={},n=Object.prototype,o=n.hasOwnProperty,i=Object.defineProperty||function(t,r,e){t[r]=e.value},a="function"==typeof Symbol?Symbol:{},u=a.iterator||"@@iterator",c=a.asyncIterator||"@@asyncIterator",l=a.toStringTag||"@@toStringTag";function f(t,r,e){return Object.defineProperty(t,r,{value:e,enumerable:!0,configurable:!0,writable:!0}),t[r]}try{f({},"")}catch(r){f=function(t,r,e){return t[r]=e}}function s(t,r,e,n){var o=r&&r.prototype instanceof g?r:g,a=Object.create(o.prototype),u=new T(n||[]);return i(a,"_invoke",{value:P(t,e,u)}),a}function h(t,r,e){try{return{type:"normal",arg:t.call(r,e)}}catch(t){return{type:"throw",arg:t}}}e.wrap=s;var p="suspendedStart",y="executing",v="completed",d={};function g(){}function m(){}function b(){}var w={};f(w,u,(function(){return this}));var L=Object.getPrototypeOf,O=L&&L(L(z([])));O&&O!==n&&o.call(O,u)&&(w=O);var j=b.prototype=g.prototype=Object.create(w);function x(t){["next","throw","return"].forEach((function(r){f(t,r,(function(t){return this._invoke(r,t)}))}))}function E(t,r){function e(n,i,a,u){var c=h(t[n],t,i);if("throw"!==c.type){var l=c.arg,f=l.value;return f&&"object"==typeof f&&o.call(f,"__await")?r.resolve(f.__await).then((function(t){e("next",t,a,u)}),(function(t){e("throw",t,a,u)})):r.resolve(f).then((function(t){l.value=t,a(l)}),(function(t){return e("throw",t,a,u)}))}u(c.arg)}var n;i(this,"_invoke",{value:function(t,o){function i(){return new r((function(r,n){e(t,o,r,n)}))}return n=n?n.then(i,i):i()}})}function P(t,e,n){var o=p;return function(i,a){if(o===y)throw new Error("Generator is already running");if(o===v){if("throw"===i)throw a;return{value:r,done:!0}}for(n.method=i,n.arg=a;;){var u=n.delegate;if(u){var c=_(u,n);if(c){if(c===d)continue;return c}}if("next"===n.method)n.sent=n._sent=n.arg;else if("throw"===n.method){if(o===p)throw o=v,n.arg;n.dispatchException(n.arg)}else"return"===n.method&&n.abrupt("return",n.arg);o=y;var l=h(t,e,n);if("normal"===l.type){if(o=n.done?v:"suspendedYield",l.arg===d)continue;return{value:l.arg,done:n.done}}"throw"===l.type&&(o=v,n.method="throw",n.arg=l.arg)}}}function _(t,e){var n=e.method,o=t.iterator[n];if(o===r)return e.delegate=null,"throw"===n&&t.iterator.return&&(e.method="return",e.arg=r,_(t,e),"throw"===e.method)||"return"!==n&&(e.method="throw",e.arg=new TypeError("The iterator does not provide a '"+n+"' method")),d;var i=h(o,t.iterator,e.arg);if("throw"===i.type)return e.method="throw",e.arg=i.arg,e.delegate=null,d;var a=i.arg;return a?a.done?(e[t.resultName]=a.value,e.next=t.nextLoc,"return"!==e.method&&(e.method="next",e.arg=r),e.delegate=null,d):a:(e.method="throw",e.arg=new TypeError("iterator result is not an object"),e.delegate=null,d)}function S(t){var r={tryLoc:t[0]};1 in t&&(r.catchLoc=t[1]),2 in t&&(r.finallyLoc=t[2],r.afterLoc=t[3]),this.tryEntries.push(r)}function k(t){var r=t.completion||{};r.type="normal",delete r.arg,t.completion=r}function T(t){this.tryEntries=[{tryLoc:"root"}],t.forEach(S,this),this.reset(!0)}function z(t){if(t||""===t){var e=t[u];if(e)return e.call(t);if("function"==typeof t.next)return t;if(!isNaN(t.length)){var n=-1,i=function e(){for(;++n<t.length;)if(o.call(t,n))return e.value=t[n],e.done=!1,e;return e.value=r,e.done=!0,e};return i.next=i}}throw new TypeError(typeof t+" is not iterable")}return m.prototype=b,i(j,"constructor",{value:b,configurable:!0}),i(b,"constructor",{value:m,configurable:!0}),m.displayName=f(b,l,"GeneratorFunction"),e.isGeneratorFunction=function(t){var r="function"==typeof t&&t.constructor;return!!r&&(r===m||"GeneratorFunction"===(r.displayName||r.name))},e.mark=function(t){return Object.setPrototypeOf?Object.setPrototypeOf(t,b):(t.__proto__=b,f(t,l,"GeneratorFunction")),t.prototype=Object.create(j),t},e.awrap=function(t){return{__await:t}},x(E.prototype),f(E.prototype,c,(function(){return this})),e.AsyncIterator=E,e.async=function(t,r,n,o,i){void 0===i&&(i=Promise);var a=new E(s(t,r,n,o),i);return e.isGeneratorFunction(r)?a:a.next().then((function(t){return t.done?t.value:a.next()}))},x(j),f(j,l,"Generator"),f(j,u,(function(){return this})),f(j,"toString",(function(){return"[object Generator]"})),e.keys=function(t){var r=Object(t),e=[];for(var n in r)e.push(n);return e.reverse(),function t(){for(;e.length;){var n=e.pop();if(n in r)return t.value=n,t.done=!1,t}return t.done=!0,t}},e.values=z,T.prototype={constructor:T,reset:function(t){if(this.prev=0,this.next=0,this.sent=this._sent=r,this.done=!1,this.delegate=null,this.method="next",this.arg=r,this.tryEntries.forEach(k),!t)for(var e in this)"t"===e.charAt(0)&&o.call(this,e)&&!isNaN(+e.slice(1))&&(this[e]=r)},stop:function(){this.done=!0;var t=this.tryEntries[0].completion;if("throw"===t.type)throw t.arg;return this.rval},dispatchException:function(t){if(this.done)throw t;var e=this;function n(n,o){return u.type="throw",u.arg=t,e.next=n,o&&(e.method="next",e.arg=r),!!o}for(var i=this.tryEntries.length-1;i>=0;--i){var a=this.tryEntries[i],u=a.completion;if("root"===a.tryLoc)return n("end");if(a.tryLoc<=this.prev){var c=o.call(a,"catchLoc"),l=o.call(a,"finallyLoc");if(c&&l){if(this.prev<a.catchLoc)return n(a.catchLoc,!0);if(this.prev<a.finallyLoc)return n(a.finallyLoc)}else if(c){if(this.prev<a.catchLoc)return n(a.catchLoc,!0)}else{if(!l)throw new Error("try statement without catch or finally");if(this.prev<a.finallyLoc)return n(a.finallyLoc)}}}},abrupt:function(t,r){for(var e=this.tryEntries.length-1;e>=0;--e){var n=this.tryEntries[e];if(n.tryLoc<=this.prev&&o.call(n,"finallyLoc")&&this.prev<n.finallyLoc){var i=n;break}}i&&("break"===t||"continue"===t)&&i.tryLoc<=r&&r<=i.finallyLoc&&(i=null);var a=i?i.completion:{};return a.type=t,a.arg=r,i?(this.method="next",this.next=i.finallyLoc,d):this.complete(a)},complete:function(t,r){if("throw"===t.type)throw t.arg;return"break"===t.type||"continue"===t.type?this.next=t.arg:"return"===t.type?(this.rval=this.arg=t.arg,this.method="return",this.next="end"):"normal"===t.type&&r&&(this.next=r),d},finish:function(t){for(var r=this.tryEntries.length-1;r>=0;--r){var e=this.tryEntries[r];if(e.finallyLoc===t)return this.complete(e.completion,e.afterLoc),k(e),d}},catch:function(t){for(var r=this.tryEntries.length-1;r>=0;--r){var e=this.tryEntries[r];if(e.tryLoc===t){var n=e.completion;if("throw"===n.type){var o=n.arg;k(e)}return o}}throw new Error("illegal catch attempt")},delegateYield:function(t,e,n){return this.delegate={iterator:z(t),resultName:e,nextLoc:n},"next"===this.method&&(this.arg=r),d}},e},setPrototypeOf:n,toPrimitive:a,toPropertyKey:u,unsupportedIterableToArray:o})}}}));

// ── FishingArcadeGame_v3 — Full Game Implementation ───────────────────────────
(function FishingArcadeGame_v3() {
  if (typeof cc === 'undefined' || !cc.director) return;
  if (window._FAG_INIT) return;
  window._FAG_INIT = true;

  var SERVER = window._GAME_SERVER || 'http://localhost:3000';
  var WS_SRV = SERVER.replace(/^http/, 'ws');
  var MUL_STEPS = [1, 2, 5, 10, 20, 50, 100];
  var SLOT_POS = [[-520,-260],[520,-260],[-520,260],[520,260]];

  var g = {
    token:null, userId:null, nickname:'Guest', gold:0,
    room:null, localSlot:0, cannonMul:1,
    fishNodes:{}, fish:{}, bullets:[],
    hudRefs:null, fishLayer:null, bulletLayer:null,
    aimLineGfx:null, cannonNodes:[], cannonStates:{},
    canvasRef:null, waitingOverlay:null,
    disposed:true, _updateHandler:null, _jackpotPoll:null,
    _prevJackpot:0, _jpRoller:null
  };
  window._g = g;

  function col(r,g_,b,a){ return new cc.Color(r,g_,b,a!==undefined?a:255); }

  function mkLabel(parent,text,size,x,y,color,w){
    var n=new cc.Node(text); n.layer=cc.Layers.Enum.UI_2D; parent.addChild(n);
    n.setPosition(x,y,0);
    n.addComponent(cc.UITransformComponent).setContentSize(w||600,size+16);
    var lb=n.addComponent(cc.Label);
    lb.useSystemFont=true; lb.fontFamily='Arial'; lb.string=text; lb.fontSize=size;
    lb.lineHeight=size+4;
    lb.horizontalAlign=cc.Label.HorizontalAlign.CENTER;
    lb.verticalAlign=cc.Label.VerticalAlign.CENTER;
    lb.color=color||col(255,255,255); return n;
  }

  function mkBtn(parent,text,size,x,y,bgCol,txtCol,w,h){
    var n=new cc.Node(text+'_btn'); n.layer=cc.Layers.Enum.UI_2D; parent.addChild(n);
    n.setPosition(x,y,0); var bw=w||260,bh=h||56;
    n.addComponent(cc.UITransformComponent).setContentSize(bw,bh);
    var gfx=n.addComponent(cc.Graphics);
    gfx.fillColor=bgCol||col(60,100,180); gfx.rect(-bw/2,-bh/2,bw,bh); gfx.fill();
    gfx.strokeColor=col(200,220,255,160); gfx.lineWidth=2; gfx.rect(-bw/2,-bh/2,bw,bh); gfx.stroke();
    mkLabel(n,text,size,0,0,txtCol||col(255,255,255),bw-16); return n;
  }

  function bez4(pts,t){
    var u=1-t,u2=u*u,t2=t*t;
    return{x:u2*u*pts[0].x+3*u2*t*pts[1].x+3*u*t2*pts[2].x+t2*t*pts[3].x,
           y:u2*u*pts[0].y+3*u2*t*pts[1].y+3*u*t2*pts[2].y+t2*t*pts[3].y};
  }

  function buildOcean(canvas){
    var n=new cc.Node('Ocean'); n.layer=cc.Layers.Enum.UI_2D; canvas.addChild(n);
    n.setPosition(0,0,0); n.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    var gfx=n.addComponent(cc.Graphics);
    var layers=[[col(0,10,40),-360,120],[col(0,30,80),-240,120],[col(0,60,120),-120,120],
                [col(0,90,160),0,120],[col(10,120,190),120,120],[col(30,150,210),240,120]];
    for(var i=0;i<layers.length;i++){
      gfx.fillColor=layers[i][0]; gfx.rect(-640,layers[i][1],1280,layers[i][2]+2); gfx.fill();
    }
    var cxs=[-560,-380,-180,120,340,540];
    gfx.fillColor=col(200,70,80,200);
    for(var ci=0;ci<cxs.length;ci++){
      var bx=cxs[ci],by=-310;
      gfx.moveTo(bx,by); gfx.lineTo(bx-10,by+40); gfx.lineTo(bx+10,by+40); gfx.close(); gfx.fill();
      gfx.moveTo(bx-14,by+15); gfx.lineTo(bx-22,by+50); gfx.lineTo(bx-6,by+50); gfx.close(); gfx.fill();
      gfx.moveTo(bx+14,by+10); gfx.lineTo(bx+6,by+45); gfx.lineTo(bx+22,by+45); gfx.close(); gfx.fill();
    }
    gfx.fillColor=col(20,60,40); gfx.rect(-640,-360,1280,52); gfx.fill();
    return n;
  }

  function mkFishNode(parent,f){
    var n=new cc.Node('fish_'+f.fishId); n.layer=cc.Layers.Enum.UI_2D; parent.addChild(n);
    n.setPosition(f.posX,f.posY,0);
    n.addComponent(cc.UITransformComponent).setContentSize(300,300);
    var gfx=n.addComponent(cc.Graphics);
    var r=f.fishType==='boss'?100:f.fishType==='elite'?55:38;
    var bc=f.fishType==='boss'?col(160,40,200,230):f.fishType==='elite'?col(240,190,0,230):col(40,110,240,210);
    if(f.fishType!=='normal'){
      gfx.strokeColor=f.fishType==='boss'?col(200,80,255,160):col(255,210,50,180);
      gfx.lineWidth=f.fishType==='boss'?12:6;
      gfx.circle(0,0,r+(f.fishType==='boss'?22:14)); gfx.stroke();
    }
    gfx.fillColor=bc; gfx.circle(0,0,r); gfx.fill();
    gfx.moveTo(-r+5,0); gfx.lineTo(-r-r*0.9,r*0.55); gfx.lineTo(-r-r*0.9,-r*0.55); gfx.close(); gfx.fill();
    gfx.fillColor=col(255,255,255); gfx.circle(r*0.6,r*0.22,r*0.22); gfx.fill();
    gfx.fillColor=col(0,0,0); gfx.circle(r*0.65,r*0.22,r*0.11); gfx.fill();
    if(f.rewardMultiplier>1) mkLabel(n,'x'+f.rewardMultiplier,18,0,r+14,col(255,240,100),90);
    if(f.fishType==='boss'){
      var hpN=new cc.Node('hpbar'); hpN.layer=cc.Layers.Enum.UI_2D; n.addChild(hpN);
      hpN.setPosition(0,r+30,0); hpN.addComponent(cc.UITransformComponent).setContentSize(140,16);
      var hpG=hpN.addComponent(cc.Graphics);
      hpG.fillColor=col(60,0,0,200); hpG.rect(-70,-8,140,16); hpG.fill();
      hpG.fillColor=col(220,50,50); hpG.rect(-70,-8,140,16); hpG.fill();
      n._hpBar=hpN; n._hpMax=f.maxHp||10;
    }
    n._pts=f.pathData?JSON.parse(f.pathData):null; n._fdata=f; return n;
  }

  function updateHp(fn_,hp,maxHp){
    if(!fn_._hpBar) return;
    var gfx=fn_._hpBar.getComponent(cc.Graphics); if(!gfx) return;
    gfx.clear(); gfx.fillColor=col(60,0,0,200); gfx.rect(-70,-8,140,16); gfx.fill();
    var pct=Math.max(0,Math.min(1,hp/maxHp));
    gfx.fillColor=col(220,50,50); gfx.rect(-70,-8,140*pct,16); gfx.fill();
  }

  function mkCannonNode(parent,slot,isLocal){
    var pos=SLOT_POS[slot];
    var n=new cc.Node('cannon_'+slot); n.layer=cc.Layers.Enum.UI_2D; parent.addChild(n);
    n.setPosition(pos[0],pos[1],0); n.addComponent(cc.UITransformComponent).setContentSize(130,130);
    var baseN=new cc.Node('base'); baseN.layer=cc.Layers.Enum.UI_2D; n.addChild(baseN);
    baseN.addComponent(cc.UITransformComponent).setContentSize(80,80);
    var bGfx=baseN.addComponent(cc.Graphics);
    bGfx.fillColor=isLocal?col(255,200,0,230):col(80,120,180,200);
    bGfx.circle(0,0,30); bGfx.fill();
    bGfx.strokeColor=col(255,255,255,180); bGfx.lineWidth=3; bGfx.circle(0,0,30); bGfx.stroke();
    var barrelN=new cc.Node('barrel'); barrelN.layer=cc.Layers.Enum.UI_2D; n.addChild(barrelN);
    barrelN.addComponent(cc.UITransformComponent).setContentSize(80,20);
    var rGfx=barrelN.addComponent(cc.Graphics);
    rGfx.fillColor=col(50,50,70,255);
    rGfx.rect(4,-7,50,14); rGfx.fill();
    rGfx.strokeColor=col(90,90,130,200); rGfx.lineWidth=1;
    rGfx.rect(4,-7,50,14); rGfx.stroke();
    var dx=-pos[0],dy=-pos[1];
    barrelN.angle=Math.atan2(dy,dx)*180/Math.PI;
    n._barrel=barrelN; n._pos=pos; n._slot=slot;
    mkLabel(n,'P'+(slot+1)+(isLocal?' (YOU)':''),17,0,-46,isLocal?col(255,220,0):col(180,180,200),140);
    g.cannonStates[slot]='IDLE';
    return n;
  }

  function aimCannon(slot,toX,toY){
    var cn=g.cannonNodes[slot]; if(!cn||!cn._barrel) return;
    var pos=SLOT_POS[slot];
    cn._barrel.angle=Math.atan2(toY-pos[1],toX-pos[0])*180/Math.PI;
  }

  function animateCannonFire(slot,toX,toY){
    if(!g.bulletLayer||!g.cannonNodes[slot]) return;
    var pos=SLOT_POS[slot];
    var dx=toX-pos[0],dy=toY-pos[1],d=Math.sqrt(dx*dx+dy*dy)||1;
    var tipX=pos[0]+dx/d*56,tipY=pos[1]+dy/d*56;
    var flash=new cc.Node('flash'); flash.layer=cc.Layers.Enum.UI_2D;
    g.bulletLayer.addChild(flash);
    flash.setPosition(tipX,tipY,0);
    flash.addComponent(cc.UITransformComponent).setContentSize(80,80);
    var fg=flash.addComponent(cc.Graphics);
    fg.fillColor=col(255,255,200,230); fg.circle(0,0,16); fg.fill();
    fg.strokeColor=col(255,200,50,210); fg.lineWidth=4;
    for(var ri=0;ri<8;ri++){
      var a=ri*45*Math.PI/180;
      fg.moveTo(Math.cos(a)*14,Math.sin(a)*14);
      fg.lineTo(Math.cos(a)*30,Math.sin(a)*30);
    }
    fg.stroke();
    g.cannonStates[slot]='FIRING';
    setTimeout(function(){if(flash&&flash.parent)flash.destroy();g.cannonStates[slot]='COOLING';},150);
    setTimeout(function(){g.cannonStates[slot]='IDLE';},380);
  }

  function drawAimLine(fx,fy,tx,ty){
    if(!g.aimLineGfx) return;
    g.aimLineGfx.clear();
    var dx=tx-fx,dy=ty-fy,d=Math.sqrt(dx*dx+dy*dy)||1;
    var seg=22,gap=10,total=seg+gap,segs=Math.ceil(d/total);
    g.aimLineGfx.strokeColor=col(255,255,180,130);
    g.aimLineGfx.lineWidth=2;
    for(var si=0;si<segs;si++){
      var t0=si*total/d,t1=Math.min(1,(si*total+seg)/d);
      g.aimLineGfx.moveTo(fx+dx*t0,fy+dy*t0);
      g.aimLineGfx.lineTo(fx+dx*t1,fy+dy*t1);
    }
    g.aimLineGfx.stroke();
  }
  function clearAimLine(){if(g.aimLineGfx)g.aimLineGfx.clear();}

  function rollJackpot(newVal){
    if(!g.hudRefs) return;
    var lbl=g.hudRefs.jackpotLbl;
    var oldVal=g._prevJackpot;
    g._prevJackpot=newVal;
    if(Math.abs(newVal-oldVal)<5){lbl.string='JACKPOT: '+Math.round(newVal).toLocaleString();return;}
    var start=Date.now(),dur=700,diff=newVal-oldVal;
    if(g._jpRoller)clearInterval(g._jpRoller);
    g._jpRoller=setInterval(function(){
      var el=Date.now()-start;
      if(el>=dur){lbl.string='JACKPOT: '+Math.round(newVal).toLocaleString();clearInterval(g._jpRoller);g._jpRoller=null;return;}
      var t=el/dur; t=t<0.5?2*t*t:-1+(4-2*t)*t;
      lbl.string='JACKPOT: '+Math.round(oldVal+diff*t).toLocaleString();
    },33);
  }

  function fireBullet(fromX,fromY,toX,toY){
    if(!g.bulletLayer||!g.bulletLayer.parent) return;
    var n=new cc.Node('blt'); n.layer=cc.Layers.Enum.UI_2D; g.bulletLayer.addChild(n);
    n.setPosition(fromX,fromY,0); n.addComponent(cc.UITransformComponent).setContentSize(20,20);
    var gfx=n.addComponent(cc.Graphics); gfx.fillColor=col(255,255,100); gfx.circle(0,0,5); gfx.fill();
    var dx=toX-fromX,dy=toY-fromY,d=Math.sqrt(dx*dx+dy*dy)||1,spd=900;
    g.bullets.push({n:n,sx:fromX,sy:fromY,vx:dx/d*spd,vy:dy/d*spd,t0:Date.now(),life:d/spd*1000});
  }

  function buildHUD(canvas){
    var refs={};
    refs.jackpotLbl=mkLabel(canvas,'JACKPOT: 10,000',36,0,328,col(255,215,0),650).getComponent(cc.Label);
    refs.goldLbl=mkLabel(canvas,'Gold: 0',24,-490,328,col(255,230,100),200).getComponent(cc.Label);
    refs.rtpLbl=mkLabel(canvas,'RTP 96%',20,530,-330,col(140,220,140),150).getComponent(cc.Label);
    refs.stateLbl=mkLabel(canvas,'WAITING',20,-510,-330,col(180,180,220),180).getComponent(cc.Label);
    var mulRow=new cc.Node('mul'); mulRow.layer=cc.Layers.Enum.UI_2D; canvas.addChild(mulRow);
    mulRow.setPosition(0,-315,0); mulRow.addComponent(cc.UITransformComponent).setContentSize(350,45);
    mkLabel(mulRow,'<',30,-100,0,col(255,255,255,200),50).on(cc.Node.EventType.TOUCH_END,function(){
      var i=MUL_STEPS.indexOf(g.cannonMul);
      if(i>0){g.cannonMul=MUL_STEPS[i-1];refs.mulLbl.string='BET x'+g.cannonMul;}
    });
    refs.mulLbl=mkLabel(mulRow,'BET x1',26,0,0,col(255,215,0),130).getComponent(cc.Label);
    mkLabel(mulRow,'>',30,100,0,col(255,255,255,200),50).on(cc.Node.EventType.TOUCH_END,function(){
      var i=MUL_STEPS.indexOf(g.cannonMul);
      if(i<MUL_STEPS.length-1){g.cannonMul=MUL_STEPS[i+1];refs.mulLbl.string='BET x'+g.cannonMul;}
    });
    return refs;
  }

  function mkWaitOverlay(canvas){
    var ov=new cc.Node('WaitOv'); ov.layer=cc.Layers.Enum.UI_2D; canvas.addChild(ov);
    ov.setPosition(0,0,0); ov.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    var gfx=ov.addComponent(cc.Graphics);
    gfx.fillColor=col(0,0,30,190); gfx.rect(-640,-360,1280,720); gfx.fill();
    mkLabel(ov,'WAITING FOR PLAYERS',50,0,80,col(255,215,50),700);
    var slbl=mkLabel(ov,'0 / 4 players',30,0,10,col(200,200,255),350).getComponent(cc.Label);
    mkBtn(ov,'START NOW',28,0,-60,col(50,180,50),col(255,255,255),300,55)
      .on(cc.Node.EventType.TOUCH_END,function(){if(g.room)g.room.send('start_game',{});});
    return{node:ov,slbl:slbl};
  }

  var NET={
    _retries:0, _delays:[1000,2000,4000],
    auth:function(){
      if(g.token) return Promise.resolve(g.token);
      var devId='dev-'+(navigator.userAgent.slice(0,20)+Date.now()).replace(/\W/g,'').slice(0,30);
      return fetch(SERVER+'/api/v1/auth/guest',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nickname:g.nickname,deviceId:devId})
      }).then(function(r){return r.json();}).then(function(j){
        if(!j.data||!j.data.token) throw new Error('auth failed');
        g.token=j.data.token; g.userId=j.data.userId;
        g.nickname=j.data.nickname||g.nickname; return g.token;
      });
    },
    connect:function(cbOk,cbErr){
      NET.auth().then(function(tok){
        var Cly=window.Colyseus; if(!Cly) throw new Error('Colyseus missing');
        return(new Cly.Client(WS_SRV)).joinOrCreate('fishing_room',{token:tok,nickname:g.nickname});
      }).then(function(room){
        g.room=room; NET._retries=0;
        var first=true;
        room.onStateChange(function(state){
          if(first){
            first=false;
            if(state&&state.fish){
              state.fish.onAdd(function(fish,key){
                if(!g.fishNodes||g.fishNodes[key]) return;
                var nd=mkFishNode(g.fishLayer,fish);
                g.fishNodes[key]=nd; g.fish[key]=fish;
                fish.onChange(function(){if(nd._hpBar)updateHp(nd,fish.hp,fish.maxHp||nd._hpMax||10);});
              },true);
              state.fish.onRemove(function(fish,key){
                var nd=g.fishNodes&&g.fishNodes[key];
                if(nd&&nd.parent)nd.destroy();
                if(g.fishNodes)delete g.fishNodes[key];
                if(g.fish)delete g.fish[key];
              });
            }
          }
          if(state.jackpotPool!==undefined)
            rollJackpot(Math.round(Number(state.jackpotPool)));
          if(state.roomState&&g.hudRefs){
            g.hudRefs.stateLbl.string=state.roomState;
            if(state.roomState!=='WAITING'&&g.waitingOverlay)g.waitingOverlay.node.active=false;
          }
          if(state.players){
            var cnt=0;
            state.players.forEach(function(p){
              cnt++;
              if(g.room&&p.playerId===g.room.sessionId){
                if(p.slotIndex!==undefined)g.localSlot=p.slotIndex;
                if(p.gold!==undefined){g.gold=p.gold;if(g.hudRefs)g.hudRefs.goldLbl.string='Gold: '+g.gold.toLocaleString();}
              }
            });
            if(g.waitingOverlay)g.waitingOverlay.slbl.string=cnt+' / 4 players';
          }
        });
        room.onMessage('shoot_result',function(m){
          if(m.gold!==undefined&&g.hudRefs){g.gold=m.gold;g.hudRefs.goldLbl.string='Gold: '+g.gold.toLocaleString();}
        });
        room.onMessage('fish_killed',function(m){
          if(!m.reward||!g.canvasRef) return;
          g.gold+=m.reward; if(g.hudRefs)g.hudRefs.goldLbl.string='Gold: '+g.gold.toLocaleString();
          var fx=mkLabel(g.canvasRef,'+'+m.reward,38,(Math.random()-.5)*300,(Math.random()-.5)*150,col(255,240,50),180);
          setTimeout(function(){if(fx&&fx.parent)fx.destroy();},1200);
        });
        room.onMessage('jackpot_won',function(m){
          if(!g.canvasRef) return;
          var jl=mkLabel(g.canvasRef,'JACKPOT!! +'+(m.amount||0).toLocaleString(),58,0,0,col(255,215,0),800);
          setTimeout(function(){if(jl&&jl.parent)jl.destroy();},4000);
        });
        room.onMessage('boss_spawned',function(){if(g.hudRefs)g.hudRefs.stateLbl.string='BOSS FIGHT!';});
        room.onMessage('fish_escaped',function(){});
        room.onLeave(function(code){
          if(g.disposed||code===4000) return;
          var d=NET._delays[Math.min(NET._retries++,NET._delays.length-1)];
          setTimeout(function(){if(!g.disposed)NET.connect(cbOk,cbErr);},d);
        });
        if(cbOk)cbOk(room);
      }).catch(function(e){if(cbErr)cbErr(e);});
    }
  };

  function setupGameRoom(canvas){
    g.disposed=false; g.fishNodes={}; g.fish={}; g.bullets=[];
    g.canvasRef=canvas; g._prevJackpot=0; g.cannonStates={};
    buildOcean(canvas);
    g.fishLayer=new cc.Node('FishL'); g.fishLayer.layer=cc.Layers.Enum.UI_2D; canvas.addChild(g.fishLayer);
    g.fishLayer.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    g.bulletLayer=new cc.Node('BltL'); g.bulletLayer.layer=cc.Layers.Enum.UI_2D; canvas.addChild(g.bulletLayer);
    g.bulletLayer.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    var aimLayerN=new cc.Node('AimL'); aimLayerN.layer=cc.Layers.Enum.UI_2D; canvas.addChild(aimLayerN);
    aimLayerN.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    g.aimLineGfx=aimLayerN.addComponent(cc.Graphics);
    var canL=new cc.Node('CanL'); canL.layer=cc.Layers.Enum.UI_2D; canvas.addChild(canL);
    canL.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    g.cannonNodes=[];
    for(var si=0;si<4;si++) g.cannonNodes.push(mkCannonNode(canL,si,si===g.localSlot));
    g.hudRefs=buildHUD(canvas);
    g.waitingOverlay=mkWaitOverlay(canvas);
    mkBtn(canvas,'BACK',22,-570,315,col(40,40,80,200),col(220,220,220),110,40)
      .on(cc.Node.EventType.TOUCH_END,function(){
        g.disposed=true;
        if(g._updateHandler){cc.director.off('director_after_update',g._updateHandler);g._updateHandler=null;}
        if(g._jackpotPoll){clearInterval(g._jackpotPoll);g._jackpotPoll=null;}
        if(g._jpRoller){clearInterval(g._jpRoller);g._jpRoller=null;}
        if(g.room){g.room.leave();g.room=null;}
        cc.director.loadScene('MainMenu');
      });
    var _aimActive=false;
    canvas.on(cc.Node.EventType.TOUCH_START,function(evt){
      if(!g.room) return;
      var loc=evt.getUILocation();
      var wx=loc.x-640,wy=loc.y-360;
      var sp=SLOT_POS[g.localSlot]||[0,0];
      var dx=wx-sp[0],dy=wy-sp[1];
      if(dx*dx+dy*dy<3600){_aimActive=false;return;}
      _aimActive=true;
      aimCannon(g.localSlot,wx,wy);
      drawAimLine(sp[0],sp[1],wx,wy);
    });
    canvas.on(cc.Node.EventType.TOUCH_MOVE,function(evt){
      if(!g.room||!_aimActive) return;
      var loc=evt.getUILocation();
      var wx=loc.x-640,wy=loc.y-360;
      var sp=SLOT_POS[g.localSlot]||[0,0];
      aimCannon(g.localSlot,wx,wy);
      drawAimLine(sp[0],sp[1],wx,wy);
    });
    canvas.on(cc.Node.EventType.TOUCH_END,function(evt){
      clearAimLine(); var wasAiming=_aimActive; _aimActive=false;
      if(!g.room||!wasAiming) return;
      var loc=evt.getUILocation();
      var wx=loc.x-640,wy=loc.y-360;
      var sp=SLOT_POS[g.localSlot]||[0,0];
      var dx=wx-sp[0],dy=wy-sp[1];
      if(dx*dx+dy*dy<3600) return;
      var angle=Math.atan2(dy,dx)*180/Math.PI;
      var nearFishId=null,nearDist=Infinity;
      if(g.fish){Object.keys(g.fish).forEach(function(fid){var fd=g.fish[fid];if(!fd||!fd.alive)return;var fdx=(fd.posX||0)-wx,fdy=(fd.posY||0)-wy;var d=fdx*fdx+fdy*fdy;if(d<nearDist){nearDist=d;nearFishId=fid;}});}
      var bId='b'+Date.now()+Math.random().toString(36).slice(2,7);
      var betAmt=Math.max(1,(g.cannonMul||1))*100;
      if(nearFishId)g.room.send('shoot',{bulletId:bId,fishId:nearFishId,betAmount:betAmt,cannonMultiplier:g.cannonMul||1});
      fireBullet(sp[0],sp[1],wx,wy);
      animateCannonFire(g.localSlot,wx,wy);
    });
    canvas.on(cc.Node.EventType.TOUCH_CANCEL,function(){clearAimLine();_aimActive=false;});
    var upd=function(){
      if(g.disposed) return;
      var now=Date.now();
      var keys=Object.keys(g.fishNodes);
      for(var fi=0;fi<keys.length;fi++){
        var fid=keys[fi],fn_=g.fishNodes[fid],fd=g.fish[fid];
        if(!fn_||!fd||!fn_._pts) continue;
        var t=Math.min(1,(now-fd.startTimeMs)/fd.durationMs);
        var bp=bez4(fn_._pts,t);
        fn_.setPosition(bp.x,bp.y,0);
      }
      var alive=[];
      for(var bi=0;bi<g.bullets.length;bi++){
        var b=g.bullets[bi],el=now-b.t0;
        if(el>=b.life||!b.n.parent){if(b.n.parent)b.n.destroy();continue;}
        var s=el/1000; b.n.setPosition(b.sx+b.vx*s,b.sy+b.vy*s,0); alive.push(b);
      }
      g.bullets=alive;
    };
    cc.director.on('director_after_update',upd); g._updateHandler=upd;
    g._jackpotPoll=setInterval(function(){
      if(g.disposed){clearInterval(g._jackpotPoll);return;}
      fetch(SERVER+'/api/v1/game/jackpot/pool').then(function(r){return r.json();})
        .then(function(j){if(j.data&&g.hudRefs)rollJackpot(j.data.amount);})
        .catch(function(){});
    },5000);
    var connLbl=mkLabel(canvas,'Connecting to server...',26,0,0,col(180,200,255,200),450);
    NET.connect(function(){
      if(connLbl&&connLbl.parent)connLbl.destroy();
    },function(){
      var lb=connLbl&&connLbl.getComponent(cc.Label);
      if(lb)lb.string='Failed to connect. Retrying...';
    });
  }

  function setupMainMenu(canvas){
    g.disposed=true;
    if(g._updateHandler){cc.director.off('director_after_update',g._updateHandler);g._updateHandler=null;}
    if(g._jackpotPoll){clearInterval(g._jackpotPoll);g._jackpotPoll=null;}
    if(g._jpRoller){clearInterval(g._jpRoller);g._jpRoller=null;}
    if(g.room){try{g.room.leave();}catch(e){}g.room=null;}
    buildOcean(canvas);
    var tl=mkLabel(canvas,'FISHING ARCADE',70,0,230,col(255,215,50),800);
    tl.getComponent(cc.Label).isBold=true;
    mkLabel(canvas,'Multi-player Deep Sea Adventure',24,0,160,col(180,220,255,200),600);
    var jpLbl=mkLabel(canvas,'JACKPOT: Loading...',38,0,85,col(255,200,0),650).getComponent(cc.Label);
    var piLbl=mkLabel(canvas,'Guest | Gold: 0',22,0,30,col(200,200,210,220),500).getComponent(cc.Label);
    mkBtn(canvas,'QUICK MATCH',34,0,-55,col(200,70,110,240),col(255,255,255),300,65)
      .on(cc.Node.EventType.TOUCH_END,function(){cc.director.loadScene('GameRoom');});
    mkBtn(canvas,'SHOP',28,0,-145,col(50,90,160,220),col(220,230,255),200,52)
      .on(cc.Node.EventType.TOUCH_END,function(){cc.director.loadScene('Shop');});
    mkLabel(canvas,'v1.0 - Fishing Arcade Game',16,0,-330,col(100,110,150,180),500);
    fetch(SERVER+'/api/v1/game/jackpot/pool').then(function(r){return r.json();})
      .then(function(j){if(j.data)jpLbl.string='JACKPOT: '+j.data.amount.toLocaleString();})
      .catch(function(){jpLbl.string='JACKPOT: 10,000';});
    NET.auth().then(function(){
      piLbl.string=(g.nickname||'Guest')+' | Gold: '+g.gold.toLocaleString();
    }).catch(function(){});
  }

  function setupShop(canvas){
    buildOcean(canvas);
    mkLabel(canvas,'SHOP',62,0,270,col(255,215,50),400).getComponent(cc.Label).isBold=true;
    mkLabel(canvas,'Cannon Upgrades',26,0,205,col(200,210,255,210),500);
    var pkgs=[
      {name:'Cannon x10',cost:1000,mul:10,c:col(50,100,200,230)},
      {name:'Cannon x50',cost:4000,mul:50,c:col(100,50,200,230)},
      {name:'Cannon x100',cost:8000,mul:100,c:col(180,50,50,230)}
    ];
    for(var pi=0;pi<pkgs.length;pi++){
      (function(pk,idx){
        mkBtn(canvas,pk.name+'   '+pk.cost+' gold',26,0,120-idx*100,pk.c,col(255,255,255),420,60)
          .on(cc.Node.EventType.TOUCH_END,function(){g.cannonMul=pk.mul;cc.director.loadScene('GameRoom');});
      })(pkgs[pi],pi);
    }
    mkBtn(canvas,'BACK',30,0,-230,col(40,60,110,220),col(200,220,255),200,52)
      .on(cc.Node.EventType.TOUCH_END,function(){cc.director.loadScene('MainMenu');});
  }

  cc.director.on('director_after_scene_launch',function(scene){
    if(!scene)scene=cc.director.getScene();
    if(!scene) return;
    var cv=scene.getChildByName('Canvas'); if(!cv) return;
    var nm=scene.name;
    if(nm==='MainMenu')setupMainMenu(cv);
    else if(nm==='Shop')setupShop(cv);
    else if(nm==='GameRoom')setupGameRoom(cv);
  });
})();


} }; });