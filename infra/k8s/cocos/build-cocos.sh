#!/usr/bin/env bash
# Fishing Arcade Game — Cocos Web Client Build & Deploy
# Usage: ./infra/k8s/cocos/build-cocos.sh [IMAGE_TAG]
#
# Steps:
#   0. CocosCreator CLI builds client/ → client/build/web-desktop/
#   1. Upload build context to PVC (kaniko-context in fishing-game namespace)
#   2. Kaniko builds nginx image and pushes to in-cluster registry
#   3. kubectl apply fishing-cocos deployment/service
set -euo pipefail

export PATH="$PATH:$HOME/.rd/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLIENT_DIR="$PROJECT_ROOT/client"
NAMESPACE="fishing-game"
REGISTRY_SVC="registry.${NAMESPACE}.svc.cluster.local:5000"
REGISTRY_NODE="localhost:30501"
IMAGE_TAG="${1:-cocos-$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'dev')}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[cocos-build]${NC} $*"; }
warn() { echo -e "${YELLOW}[cocos-build]${NC} $*"; }
die()  { echo -e "${RED}[cocos-build] ERROR:${NC} $*" >&2; exit 1; }

# ── Step 0: Cocos Creator CLI build ──────────────────────────────────────────
cocos_build() {
  log "[0/3] Building Cocos web-desktop (CC 3.8.7)..."

  if [ -z "${COCOS_CLI:-}" ]; then
    case "$(uname -s)" in
      Darwin)
        COCOS_CLI="/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator"
        ;;
      MINGW*|MSYS*|CYGWIN*)
        COCOS_CLI="/c/Program Files/Cocos/Creator/3.8.7/CocosCreator.exe"
        ;;
      *)
        COCOS_CLI=""
        ;;
    esac
  fi

  if [ -z "$COCOS_CLI" ] || [ ! -f "$COCOS_CLI" ]; then
    warn "CocosCreator not found (COCOS_CLI=${COCOS_CLI:-unset})"
    if [ -d "$CLIENT_DIR/build/web-desktop" ]; then
      warn "Using existing build output at client/build/web-desktop/"
    else
      die "No build output found and CocosCreator not available. Run 'Build' manually in Cocos Creator first."
    fi
  else
    local BUILD_LOG
    BUILD_LOG="$(mktemp)"
    log "Running: $COCOS_CLI --project $CLIENT_DIR --build 'platform=web-desktop;debug=false;outputPath=./build'"
    "$COCOS_CLI" \
      --project "$CLIENT_DIR" \
      --build "platform=web-desktop;debug=false;outputPath=./build" \
      >"$BUILD_LOG" 2>&1 || true
    grep -E "(error|Error|complete|failed|success)" "$BUILD_LOG" | tail -10 || true
    rm -f "$BUILD_LOG"

    [ -d "$CLIENT_DIR/build/web-desktop" ] || die "Build failed — client/build/web-desktop/ not found"
    [ -f "$CLIENT_DIR/build/web-desktop/index.html" ] || die "Build failed — index.html not found"
    log "Cocos build complete: client/build/web-desktop/"
  fi

  # Inject Colyseus CDN script before the polyfills bundle
  local INDEX_HTML="$CLIENT_DIR/build/web-desktop/index.html"
  if ! grep -q "colyseus.js" "$INDEX_HTML"; then
    sed -i '' 's|<!-- Polyfills bundle. -->|<!-- Colyseus WebSocket client (must load before game scripts) -->\
<script src="https://unpkg.com/colyseus.js@0.15.17/dist/colyseus.js"></script>\
\
    <!-- Polyfills bundle. -->|' "$INDEX_HTML"
    log "Injected Colyseus CDN into index.html"
  fi

  # Override launchScene to MainMenu (Boot.ts script class fails to resolve in built output)
  local SETTINGS_JSON="$CLIENT_DIR/build/web-desktop/src/settings.json"
  if [ -f "$SETTINGS_JSON" ]; then
    python3 -c "
import json, os
path = '$SETTINGS_JSON'
d = json.load(open(path))
if d.get('launch', {}).get('launchScene') != 'db://assets/scenes/MainMenu.scene':
    d['launch']['launchScene'] = 'db://assets/scenes/MainMenu.scene'
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(d, f, separators=(',', ':'))
    os.replace(tmp, path)
    print('Patched launchScene → MainMenu.scene')
"
    log "launchScene verified: MainMenu.scene"
  fi

  # Patch built scene JSONs: remove null component entries (avoids CC3 Error 3817)
  local IMPORT_DIR="$CLIENT_DIR/build/web-desktop/assets/main/import"
  if [ -d "$IMPORT_DIR" ]; then
    log "Patching built scene JSONs to remove null components..."
    IMPORT_DIR_PATH="$IMPORT_DIR" python3 << 'PYEOF'
import os, json, glob

import_dir = os.environ['IMPORT_DIR_PATH']
patched = 0

def remove_nulls(obj):
    if isinstance(obj, list):
        return [remove_nulls(item) for item in obj if item is not None]
    if isinstance(obj, dict):
        return {k: remove_nulls(v) for k, v in obj.items()}
    return obj

for path in glob.glob(f'{import_dir}/**/*.json', recursive=True):
    with open(path) as f:
        raw = f.read()
    if 'null' not in raw:
        continue
    data = json.loads(raw)
    fixed = remove_nulls(data)
    if json.dumps(fixed) != json.dumps(data):
        tmp = path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(fixed, f, separators=(',', ':'))
        os.replace(tmp, path)
        patched += 1

print(f'Patched {patched} scene file(s)')
PYEOF
    log "Scene JSON patching complete"
  fi

  # Inject game scene setup into bundle.js (director event approach — no ccclass needed)
  local BUNDLE_JS="$CLIENT_DIR/build/web-desktop/src/chunks/bundle.js"
  if [ -f "$BUNDLE_JS" ] && ! grep -q "FishingArcadeGame_v3" "$BUNDLE_JS"; then
    log "Injecting game scene setup into bundle.js..."
    BUNDLE_JS_PATH="$BUNDLE_JS" python3 << 'PYEOF'
import os
bundle_path = os.environ['BUNDLE_JS_PATH']
with open(bundle_path, 'r') as f:
    src = f.read()

# Strip any leftover old injection by finding the injection marker
marker = '\n\n// ── FishingArcadeGame_v'
marker_idx = src.find(marker)
if marker_idx != -1:
    base = src[:marker_idx]
else:
    closing = '\n\n} }; });'
    close_idx = src.rfind(closing)
    base = src[:close_idx] if close_idx != -1 else src.rstrip()

injection = r"""

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

  // ── Cannon with rotatable barrel ────────────────────────────────────────────
  function mkCannonNode(parent,slot,isLocal){
    var pos=SLOT_POS[slot];
    var n=new cc.Node('cannon_'+slot); n.layer=cc.Layers.Enum.UI_2D; parent.addChild(n);
    n.setPosition(pos[0],pos[1],0); n.addComponent(cc.UITransformComponent).setContentSize(130,130);
    // Base platform
    var baseN=new cc.Node('base'); baseN.layer=cc.Layers.Enum.UI_2D; n.addChild(baseN);
    baseN.addComponent(cc.UITransformComponent).setContentSize(80,80);
    var bGfx=baseN.addComponent(cc.Graphics);
    bGfx.fillColor=isLocal?col(255,200,0,230):col(80,120,180,200);
    bGfx.circle(0,0,30); bGfx.fill();
    bGfx.strokeColor=col(255,255,255,180); bGfx.lineWidth=3; bGfx.circle(0,0,30); bGfx.stroke();
    // Rotatable barrel child node
    var barrelN=new cc.Node('barrel'); barrelN.layer=cc.Layers.Enum.UI_2D; n.addChild(barrelN);
    barrelN.addComponent(cc.UITransformComponent).setContentSize(80,20);
    var rGfx=barrelN.addComponent(cc.Graphics);
    rGfx.fillColor=col(50,50,70,255);
    rGfx.rect(4,-7,50,14); rGfx.fill();
    rGfx.strokeColor=col(90,90,130,200); rGfx.lineWidth=1;
    rGfx.rect(4,-7,50,14); rGfx.stroke();
    // Default barrel direction: toward screen center
    var dx=-pos[0],dy=-pos[1];
    barrelN.angle=Math.atan2(dy,dx)*180/Math.PI;
    n._barrel=barrelN; n._pos=pos; n._slot=slot;
    mkLabel(n,'P'+(slot+1)+(isLocal?' (YOU)':''),17,0,-46,isLocal?col(255,220,0):col(180,180,200),140);
    g.cannonStates[slot]='IDLE';
    return n;
  }

  // Rotate cannon barrel to face (toX, toY) world coords
  function aimCannon(slot,toX,toY){
    var cn=g.cannonNodes[slot]; if(!cn||!cn._barrel) return;
    var pos=SLOT_POS[slot];
    cn._barrel.angle=Math.atan2(toY-pos[1],toX-pos[0])*180/Math.PI;
  }

  // Muzzle flash at actual fire direction
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

  // ── Dashed aim line ──────────────────────────────────────────────────────────
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

  // ── Jackpot number roller (ease-in-out animation) ────────────────────────────
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
          if(!g.hudRefs) return;
          if(state.jackpotPool!==undefined)
            rollJackpot(Math.round(Number(state.jackpotPool)));
          if(state.roomState){
            g.hudRefs.stateLbl.string=state.roomState;
            if(state.roomState!=='WAITING'&&g.waitingOverlay)g.waitingOverlay.node.active=false;
          }
          if(state.players){
            var cnt=0;
            state.players.forEach(function(p){
              cnt++;
              if(g.room&&p.sessionId===g.room.sessionId){
                if(p.slot!==undefined)g.localSlot=p.slot;
                if(p.gold!==undefined){g.gold=p.gold;g.hudRefs.goldLbl.string='Gold: '+g.gold.toLocaleString();}
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
    // Aim line layer (above bullets, below cannons)
    var aimLayerN=new cc.Node('AimL'); aimLayerN.layer=cc.Layers.Enum.UI_2D; canvas.addChild(aimLayerN);
    aimLayerN.addComponent(cc.UITransformComponent).setContentSize(1280,720);
    g.aimLineGfx=aimLayerN.addComponent(cc.Graphics);
    // Cannon layer
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
    // Touch: aim line on drag, fire on release
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
      g.room.send('shoot',{angle:angle,cannonMul:g.cannonMul});
      fireBullet(sp[0],sp[1],wx,wy);
      animateCannonFire(g.localSlot,wx,wy);
    });
    canvas.on(cc.Node.EventType.TOUCH_CANCEL,function(){clearAimLine();_aimActive=false;});
    // Frame update: fish movement + bullet movement
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
    // Jackpot poll fallback (in case server WebSocket doesn't push updates)
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
"""

new_src = base + injection + '\n\n} }; });'
tmp = bundle_path + '.tmp'
with open(tmp, 'w') as f:
    f.write(new_src)
os.replace(tmp, bundle_path)
print(f'Game scene setup injected into bundle.js ({len(new_src)} bytes)')
PYEOF
    log "Game scene setup injected into bundle.js"
  else
    log "bundle.js already patched, skipping injection"
  fi
}

# ── Step 1: Upload build context to PVC ──────────────────────────────────────
upload_context() {
  log "[1/3] Uploading Cocos build context to PVC (namespace: $NAMESPACE)..."

  # Ensure namespace exists (created by main k8s stack)
  kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || \
    kubectl create namespace "$NAMESPACE"

  # Ensure kaniko-context PVC exists
  if ! kubectl get pvc kaniko-context -n "$NAMESPACE" >/dev/null 2>&1; then
    log "Creating kaniko-context PVC..."
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kaniko-context
  namespace: ${NAMESPACE}
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF
  fi

  kubectl delete pod cocos-ctx-loader -n "$NAMESPACE" --ignore-not-found --wait=false

  kubectl run cocos-ctx-loader \
    --image=busybox:1.36 --restart=Never --namespace="$NAMESPACE" \
    --overrides='{
      "spec": {
        "volumes": [{"name":"ctx","persistentVolumeClaim":{"claimName":"kaniko-context"}}],
        "containers": [{
          "name": "cocos-ctx-loader",
          "image": "busybox:1.36",
          "command": ["sh","-c","rm -rf /workspace/* 2>/dev/null; mkdir -p /workspace/web-desktop; echo ready; sleep 3600"],
          "volumeMounts": [{"name":"ctx","mountPath":"/workspace"}]
        }]
      }
    }'

  kubectl wait pod/cocos-ctx-loader -n "$NAMESPACE" --for=condition=Ready --timeout=60s

  kubectl exec -i -n "$NAMESPACE" cocos-ctx-loader -- \
    sh -c 'cat > /workspace/Dockerfile' < "$SCRIPT_DIR/Dockerfile"
  kubectl exec -i -n "$NAMESPACE" cocos-ctx-loader -- \
    sh -c 'cat > /workspace/nginx.conf' < "$SCRIPT_DIR/nginx.conf"

  (cd "$CLIENT_DIR/build/web-desktop" && tar -cf - .) \
    | kubectl exec -i -n "$NAMESPACE" cocos-ctx-loader -- \
        sh -c 'mkdir -p /workspace/web-desktop && cd /workspace/web-desktop && tar -xf -'

  kubectl exec -n "$NAMESPACE" cocos-ctx-loader -- \
    test -f /workspace/web-desktop/index.html || die "Context upload failed — index.html not in PVC"

  kubectl delete pod cocos-ctx-loader -n "$NAMESPACE" --wait=false
  log "Build context uploaded."
}

# ── Bootstrap in-cluster registry (reuse from main build.sh pattern) ─────────
bootstrap_registry() {
  # Ensure namespace exists first
  kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || \
    kubectl create namespace "$NAMESPACE"

  # Check if registry is already running
  if kubectl get deployment registry -n "$NAMESPACE" >/dev/null 2>&1; then
    log "In-cluster registry already running."
    return 0
  fi

  log "Bootstrapping in-cluster registry..."
  cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registry
  namespace: fishing-game
spec:
  replicas: 1
  selector:
    matchLabels:
      app: registry
  template:
    metadata:
      labels:
        app: registry
    spec:
      containers:
        - name: registry
          image: registry:2
          ports:
            - containerPort: 5000
          env:
            - name: REGISTRY_STORAGE_DELETE_ENABLED
              value: "true"
---
apiVersion: v1
kind: Service
metadata:
  name: registry
  namespace: fishing-game
spec:
  selector:
    app: registry
  type: NodePort
  ports:
    - port: 5000
      targetPort: 5000
      nodePort: 30501
EOF
  kubectl rollout status deployment/registry -n "$NAMESPACE" --timeout=2m
}

# ── Step 2: Kaniko build ──────────────────────────────────────────────────────
run_kaniko() {
  log "[2/3] Running kaniko build (tag: $IMAGE_TAG)..."

  local JOB_NAME="kaniko-cocos-${IMAGE_TAG}"
  kubectl delete job "$JOB_NAME" -n "$NAMESPACE" --ignore-not-found --wait=true

  cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: kaniko
          image: gcr.io/kaniko-project/executor:v1.23.2
          args:
            - "--context=dir:///workspace"
            - "--dockerfile=/workspace/Dockerfile"
            - "--destination=${REGISTRY_SVC}/fishing-cocos:${IMAGE_TAG}"
            - "--destination=${REGISTRY_SVC}/fishing-cocos:latest"
            - "--insecure"
            - "--skip-tls-verify"
            - "--snapshot-mode=redo"
          volumeMounts:
            - name: build-context
              mountPath: /workspace
          resources:
            requests: { cpu: "500m", memory: "512Mi" }
            limits:   { cpu: "1000m", memory: "1Gi" }
      volumes:
        - name: build-context
          persistentVolumeClaim:
            claimName: kaniko-context
EOF

  kubectl wait "job/$JOB_NAME" -n "$NAMESPACE" --for=condition=complete --timeout=10m || {
    kubectl logs -n "$NAMESPACE" -l "job-name=$JOB_NAME" --tail=40 || true
    die "Kaniko build failed"
  }
  log "Image built: ${REGISTRY_SVC}/fishing-cocos:${IMAGE_TAG}"
}

# ── Step 3: Deploy to k8s ─────────────────────────────────────────────────────
deploy() {
  log "[3/3] Deploying fishing-cocos to k8s..."

  kubectl apply -f "$SCRIPT_DIR/cocos-deployment.yaml"
  kubectl set image deployment/fishing-cocos \
    cocos="${REGISTRY_NODE}/fishing-cocos:${IMAGE_TAG}" \
    -n "$NAMESPACE"
  # Force pod restart so the newly pushed image is always pulled (even with same tag)
  kubectl rollout restart deployment/fishing-cocos -n "$NAMESPACE"
  kubectl rollout status deployment/fishing-cocos -n "$NAMESPACE" --timeout=2m

  local NODE_PORT
  NODE_PORT=$(kubectl get svc fishing-cocos -n "$NAMESPACE" \
    -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30090")

  echo ""
  log "============================================"
  log " Deploy complete!"
  log " Image:    ${REGISTRY_NODE}/fishing-cocos:${IMAGE_TAG}"
  log " Game URL: http://localhost:${NODE_PORT}"
  log " Server:   ws://localhost:30000 (fishing-game-server)"
  log "============================================"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  log "=== Fishing Arcade Game — Cocos Client Build Pipeline ==="
  log "Image tag: $IMAGE_TAG | Namespace: $NAMESPACE"
  cocos_build
  bootstrap_registry
  upload_context
  run_kaniko
  deploy
}

main "$@"
