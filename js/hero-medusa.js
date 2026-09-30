// Homepage hero: the Medusa bust rendered as thousands of white spheres that
// fly in, then follow the cursor. The face turns as one rigid piece while the
// snakes and the back of the head trail behind it (the "delay wave").
// Needs three.js (r128) and js/medusa-points.js loaded first.
(function () {
  "use strict";

  var hero = document.getElementById("hero");
  var canvas = document.getElementById("hero-canvas");
  var hint = document.getElementById("hero-hint");
  var POINTS = window.MEDUSA_POINTS;
  if (!hero || !canvas || !window.THREE || !POINTS) return;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var SCALE = 9.3;
  var Y_SHIFT = 5.5;
  var JITTER = 0.006;
  var isNarrow = window.innerWidth < 480;
  var keepChance = isNarrow ? 0.62 : 1;
  // resting orientation around the vertical axis (degrees, positive = counterclockwise seen from above)
  var BASE_YAW_DEG = -20;
  var baseCos = Math.cos(BASE_YAW_DEG * Math.PI / 180);
  var baseSin = Math.sin(BASE_YAW_DEG * Math.PI / 180);

  var targets = [];
  var radii = [];
  for (var hp = 0; hp < POINTS.length; hp += 3) {
    if (Math.random() > keepChance) continue;
    var worldX = (POINTS[hp] + (Math.random() - 0.5) * JITTER) * SCALE;
    var worldY = (POINTS[hp + 1] + (Math.random() - 0.5) * JITTER) * SCALE + Y_SHIFT;
    var worldZ = (POINTS[hp + 2] + (Math.random() - 0.5) * JITTER) * SCALE;
    targets.push(worldX * baseCos + worldZ * baseSin, worldY, -worldX * baseSin + worldZ * baseCos);
    radii.push(0.26 + Math.random() * 0.17);
  }
  var count = radii.length;

  // Delay wave: a "face boundary" curve, seen from above, wraps around the face.
  // Everything in front of it moves rigidly with no delay so the face never
  // distorts. Behind it, each sphere lags in proportion to how deep behind the
  // curve it sits, so the side snakes and the back of the head trail the face.
  var MAX_DELAY_FRAMES = 24; // delay of the deepest sphere (~0.4s at 60fps)
  var FOLLOW = 0.12;         // how quickly each sphere eases toward its delayed target
  // boundary as [X, Z] points in model units, left to right
  // (X: left/right on screen, Z: depth, larger = closer to the viewer)
  var FACE_CURVE = [
    [-4.0, 2.45], [-3.0, 1.70], [-2.4, 0.85], [-1.8, 0.72], [-0.8, 0.72],
    [ 1.0, 0.80], [ 1.5, 1.25], [ 2.4, 2.50], [ 3.0, 2.95]
  ];

  function curveZ(gx) {
    if (gx <= FACE_CURVE[0][0]) return FACE_CURVE[0][1];
    for (var c = 1; c < FACE_CURVE.length; c++) {
      var a = FACE_CURVE[c - 1], b = FACE_CURVE[c];
      if (gx <= b[0]) return a[1] + (b[1] - a[1]) * (gx - a[0]) / (b[0] - a[0]);
    }
    return FACE_CURVE[FACE_CURVE.length - 1][1];
  }

  var depthBehind = new Float32Array(count);
  var maxBehind = 1e-4;
  for (var di = 0; di < count; di++) {
    var d = targets[di * 3 + 2] / SCALE - curveZ(targets[di * 3] / SCALE); // > 0 = in front
    depthBehind[di] = d < 0 ? -d : 0;
    if (depthBehind[di] > maxBehind) maxBehind = depthBehind[di];
  }
  var delays = new Uint8Array(count);
  for (var ri = 0; ri < count; ri++) {
    delays[ri] = Math.round((depthBehind[ri] / maxBehind) * MAX_DELAY_FRAMES);
  }
  var HIST = MAX_DELAY_FRAMES + 1;
  var yawHist = new Float32Array(HIST);
  var pitchHist = new Float32Array(HIST);
  var histHead = 0;
  var curYaw = new Float32Array(count);
  var curPitch = new Float32Array(count);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (err) {
    hero.classList.add("hero--no-webgl");
    return;
  }

  function heroSize() {
    return { w: hero.clientWidth || window.innerWidth, h: hero.clientHeight || window.innerHeight };
  }

  var size = heroSize();
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, size.w / size.h, 0.1, 1000);
  camera.position.set(0, 2, 190);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size.w, size.h, false);
  renderer.setClearColor(0x0b0b0c, 1);

  scene.add(new THREE.AmbientLight(0xffffff, 0.36));
  var key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(70, 90, 120);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(-90, -30, -60);
  scene.add(rim);

  var geometry = new THREE.SphereGeometry(1, 8, 6);
  var material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.05 });
  var mesh = new THREE.InstancedMesh(geometry, material, count);
  scene.add(mesh);

  var starts = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    var r = 150 + Math.random() * 70;
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(Math.random() * 2 - 1);
    starts[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starts[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starts[i * 3 + 2] = r * Math.cos(phi);
  }

  var dummy = new THREE.Object3D();
  for (var j = 0; j < count; j++) {
    dummy.position.set(starts[j * 3], starts[j * 3 + 1], starts[j * 3 + 2]);
    dummy.scale.setScalar(radii[j]);
    dummy.updateMatrix();
    mesh.setMatrixAt(j, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  function onResize() {
    var s = heroSize();
    camera.aspect = s.w / s.h;
    camera.updateProjectionMatrix();
    renderer.setSize(s.w, s.h, false);
  }
  window.addEventListener("resize", onResize);

  var mouseX = 0, mouseY = 0;
  function hideHint() {
    if (hint) hint.classList.add("hide");
  }
  window.addEventListener("pointermove", function (e) {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    hideHint();
  });
  window.addEventListener("pointerdown", hideHint);

  // only render while the hero is on screen
  var visible = true;
  var running = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !running) {
        running = true;
        requestAnimationFrame(animate);
      }
    }).observe(hero);
  }

  var ENTRANCE_MS = reduceMotion ? 1 : 2600;
  var startTime = null;

  function animate(now) {
    if (!visible) {
      running = false;
      return;
    }
    requestAnimationFrame(animate);
    if (startTime === null) startTime = now;
    var t = Math.min(1, (now - startTime) / ENTRANCE_MS);
    var eased = 1 - Math.pow(1 - t, 3);

    // cursor left -> model turns left; cursor up -> model tilts back
    var targetYaw = reduceMotion ? 0 : mouseX * 0.55;
    var targetPitch = reduceMotion ? 0 : mouseY * 0.32;

    histHead = (histHead + 1) % HIST;
    yawHist[histHead] = targetYaw;
    pitchHist[histHead] = targetPitch;

    for (var k = 0; k < count; k++) {
      var ix = k * 3;
      var bx = starts[ix] + (targets[ix] - starts[ix]) * eased;
      var by = starts[ix + 1] + (targets[ix + 1] - starts[ix + 1]) * eased;
      var bz = starts[ix + 2] + (targets[ix + 2] - starts[ix + 2]) * eased;

      if (!reduceMotion) {
        var slot = (histHead - delays[k] + HIST) % HIST;
        curYaw[k] += (yawHist[slot] - curYaw[k]) * FOLLOW;
        curPitch[k] += (pitchHist[slot] - curPitch[k]) * FOLLOW;

        var cy = Math.cos(curYaw[k]), sy = Math.sin(curYaw[k]);
        var rx = bx * cy + bz * sy;
        var rz1 = -bx * sy + bz * cy;

        var cp = Math.cos(curPitch[k]), sp = Math.sin(curPitch[k]);
        dummy.position.set(rx, by * cp - rz1 * sp, by * sp + rz1 * cp);
      } else {
        dummy.position.set(bx, by, bz);
      }
      dummy.scale.setScalar(radii[k]);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }

  hero.classList.add("hero--ready");
  running = true;
  requestAnimationFrame(animate);
})();
