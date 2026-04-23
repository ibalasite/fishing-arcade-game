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

  # Inject game controllers into bundle.js (CC3 CLI doesn't compile TS into bundles)
  local BUNDLE_JS="$CLIENT_DIR/build/web-desktop/src/chunks/bundle.js"
  if [ -f "$BUNDLE_JS" ] && ! grep -q "MainMenuController" "$BUNDLE_JS"; then
    log "Injecting game controllers into bundle.js..."
    BUNDLE_JS_PATH="$BUNDLE_JS" python3 << 'PYEOF'
import os, sys
bundle_path = os.environ.get('BUNDLE_JS_PATH')
with open(bundle_path, 'r') as f:
    src = f.read()

insert_marker = '\n\n} }; });'
idx = src.rfind(insert_marker)

controllers = '''

// ── Game Script Controllers (compiled for CC3 web-desktop) ──────────────────
(function registerGameControllers() {
  var _regAttempts = 0;
  console.log('[bundle] execute() cc:', typeof cc, '_decorator:', typeof cc !== 'undefined' && !!cc._decorator, 'Component:', typeof cc !== 'undefined' && !!cc.Component);

  function doRegister() {
    _regAttempts++;
    console.log('[bundle] doRegister #' + _regAttempts + ' cc:', typeof cc, '_dec:', typeof cc !== 'undefined' && !!cc._decorator, 'Comp:', typeof cc !== 'undefined' && !!cc.Component);
    if (typeof cc === 'undefined' || !cc._decorator || !cc.Component) {
      if (_regAttempts < 500) setTimeout(doRegister, 1);
      return;
    }
    var ccclass   = cc._decorator.ccclass;
    var Component = cc.Component;

    function makeLabel(parent, text, fontSize, x, y) {
      var node = new cc.Node(text);
      node.layer = cc.Layers.Enum.UI_2D;
      parent.addChild(node);
      node.setPosition(x, y, 0);
      var tf = node.addComponent(cc.UITransform);
      tf.setContentSize(700, fontSize + 20);
      var lbl = node.addComponent(cc.Label);
      lbl.useSystemFont = true;
      lbl.fontFamily    = 'Arial';
      lbl.string        = text;
      lbl.fontSize      = fontSize;
      lbl.lineHeight    = fontSize + 4;
      lbl.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      lbl.verticalAlign   = cc.Label.VerticalAlign.CENTER;
      lbl.color = new cc.Color(255, 255, 255, 255);
      return node;
    }

    var GNM = {
      stateCallbacks: [],
      room: null,
      connectToRoom: function() {
        return new Promise(function(resolve, reject) {
          try {
            var Cly = window.Colyseus;
            if (!Cly) throw new Error('Colyseus not loaded');
            var client = new Cly.Client('ws://localhost:3000');
            client.joinOrCreate('fishing_room').then(function(room) {
              GNM.room = room;
              room.onStateChange(function(s) {
                GNM.stateCallbacks.forEach(function(cb) { cb(s); });
              });
              resolve();
            }).catch(reject);
          } catch(e) { reject(e); }
        });
      },
      onStateChange: function(cb) { GNM.stateCallbacks.push(cb); }
    };

    ccclass('BootController')(class BootController extends Component {
      start() { cc.director.loadScene('MainMenu'); }
    });

    ccclass('MainMenuController')(class MainMenuController extends Component {
      start() {
        var canvas = this.node.parent;
        if (!canvas) return;
        makeLabel(canvas, 'Fishing Arcade', 64, 0, 220).getComponent(cc.Label).isBold = true;
        var jackpotLbl = makeLabel(canvas, 'Jackpot: ---', 40, 0, 120).getComponent(cc.Label);
        makeLabel(canvas, '\\u25b6  PLAY', 44, 0, 0).on(cc.Node.EventType.TOUCH_END, function() { cc.director.loadScene('GameRoom'); });
        makeLabel(canvas, 'SHOP', 36, 0, -80).on(cc.Node.EventType.TOUCH_END, function() { cc.director.loadScene('Shop'); });
        fetch('/api/v1/game/jackpot/pool')
          .then(function(r) { return r.json(); })
          .then(function(j) { jackpotLbl.string = 'Jackpot: ' + j.data.amount.toLocaleString(); })
          .catch(function() {});
      }
    });

    ccclass('ShopController')(class ShopController extends Component {
      start() {
        var canvas = this.node.parent;
        if (!canvas) return;
        makeLabel(canvas, 'SHOP', 64, 0, 220).getComponent(cc.Label).isBold = true;
        makeLabel(canvas, '\\u2014 Coming Soon \\u2014', 32, 0, 120);
        makeLabel(canvas, '\\u25c4  BACK', 40, 0, -100).on(cc.Node.EventType.TOUCH_END, function() { cc.director.loadScene('MainMenu'); });
      }
    });

    ccclass('GameRoomController')(class GameRoomController extends Component {
      start() {
        var canvas = this.node.parent;
        if (!canvas) return;
        makeLabel(canvas, 'GAME ROOM', 64, 0, 220).getComponent(cc.Label).isBold = true;
        var jackpotLbl = makeLabel(canvas, 'Jackpot: ---', 40, 0, 120).getComponent(cc.Label);
        makeLabel(canvas, 'Gold: 0', 36, 0, 60);
        var statusLbl = makeLabel(canvas, '\\u2014 Connecting\\u2026 \\u2014', 28, 0, -20).getComponent(cc.Label);
        makeLabel(canvas, '\\u25c4  BACK', 40, 0, -120).on(cc.Node.EventType.TOUCH_END, function() { cc.director.loadScene('MainMenu'); });
        GNM.connectToRoom()
          .then(function() {
            GNM.onStateChange(function(state) {
              if (jackpotLbl && state.jackpotPool !== undefined) {
                jackpotLbl.string = 'Jackpot: ' + Math.round(Number(state.jackpotPool)).toLocaleString();
              }
            });
            statusLbl.string = '\\u2014 Connected \\u2014';
          })
          .catch(function() { statusLbl.string = '\\u2014 Server offline \\u2014'; });
      }
    });

    console.log('[bundle] controllers registered: Boot/MainMenu/Shop/GameRoom | MMC:', cc.js.getClassByName('MainMenuController'));
  }
  doRegister();
})();
'''

if idx != -1 and insert_marker in src:
    new_src = src[:idx] + controllers + src[idx:]
else:
    new_src = src.rstrip() + controllers

tmp = bundle_path + '.tmp'
with open(tmp, 'w') as f:
    f.write(new_src)
os.replace(tmp, bundle_path)
print(f'Injected game controllers into bundle.js ({len(new_src)} bytes)')
PYEOF
    log "Game controllers injected into bundle.js"
  else
    log "bundle.js already contains game controllers, skipping injection"
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
