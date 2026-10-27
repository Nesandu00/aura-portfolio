// AURA Construction — hero 3D construction-site scene (Three.js r128, self-hosted)
(function(){
  const holder = document.getElementById('hero3d');
  if(!holder || !window.THREE) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x132238, 14, 30);
  const camera = new THREE.PerspectiveCamera(42, holder.clientWidth/holder.clientHeight, 0.1, 100);
  const camBase = new THREE.Vector3(7.5, 5.4, 9.5);
  camera.position.copy(camBase);
  camera.lookAt(0, 2.6, 0);

  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(holder.clientWidth, holder.clientHeight);
  holder.appendChild(renderer.domElement);

  const grp = new THREE.Group();
  scene.add(grp);

  const WHITE = 0xC9D6EA, RED = 0xE3343B, BLUE = 0x3A537E;
  const wire = (hex,op=.85) => new THREE.LineBasicMaterial({color:hex, transparent:true, opacity:op});

  function wireBox(w,hh,d,x,y,z,color,op){
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,hh,d)), wire(color,op));
    line.position.set(x,y,z);
    return line;
  }

  /* ---- Main tower: floors rise in sequence ---- */
  const floors = [];
  const FLOORS = 6, FH = 0.85;
  for(let i=0;i<FLOORS;i++){
    const f = wireBox(2.6, FH, 2.6, 0, FH/2 + i*FH, 0, i===FLOORS-1 ? RED : WHITE);
    f.scale.set(0.001,0.001,0.001);
    f.userData.delay = i*300;
    grp.add(f); floors.push(f);
  }
  const podium = wireBox(4.6, 0.5, 4.6, 0, 0.25, 0, WHITE); grp.add(podium);

  /* ---- Background skyline ---- */
  const skyline = [
    [1.3,2.4,1.3,  3.2,1.2,-2.6], [1.1,3.4,1.1,  4.4,1.7,-1.2],
    [1.2,1.6,1.2, -3.4,0.8,-2.2], [1.0,2.8,1.0, -4.4,1.4,-0.6],
    [1.4,1.2,1.4,  2.8,0.6, 2.6]
  ];
  skyline.forEach(([w,hh,d,x,y,z])=> grp.add(wireBox(w,hh,d,x,y,z,BLUE,.55)));

  /* ---- Crane with swinging red I-beam ---- */
  const crane = new THREE.Group();
  crane.add(wireBox(0.28, 6.6, 0.28, 0, 3.3, 0, RED));           // mast
  crane.add(wireBox(4.8, 0.24, 0.24, 2.2, 6.5, 0, RED));         // jib
  crane.add(wireBox(1.7, 0.24, 0.24, -1.15, 6.5, 0, RED));       // counter-jib
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(4,6.4,0), new THREE.Vector3(4,4,0)]), wire(WHITE));
  crane.add(cable);
  const load = new THREE.Group();                                 // lifted I-beam
  load.add(wireBox(1.5, 0.2, 0.35, 0, 0, 0, RED, 1));
  load.position.set(4, 3.8, 0);
  crane.add(load);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({color:RED, transparent:true}));
  beacon.position.set(0, 6.85, 0);
  crane.add(beacon);
  crane.position.set(-3.1, 0, 1.5);
  grp.add(crane);

  /* ---- Ground grid ---- */
  const pts = [];
  for(let i=-7;i<=7;i++){ pts.push(i,0,-7, i,0,7, -7,0,i, 7,0,i); }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  const gridMat = new THREE.LineBasicMaterial({color:BLUE, transparent:true, opacity:.35});
  grp.add(new THREE.LineSegments(gridGeo, gridMat));

  /* ---- Floating construction-dust particles ---- */
  const P = 160, pos = new Float32Array(P*3), speed = [];
  for(let i=0;i<P;i++){
    pos[i*3]   = (Math.random()-0.5)*14;
    pos[i*3+1] = Math.random()*8;
    pos[i*3+2] = (Math.random()-0.5)*14;
    speed.push(0.15 + Math.random()*0.5);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const particles = new THREE.Points(pGeo,
    new THREE.PointsMaterial({color:0x8FA7CC, size:0.06, transparent:true, opacity:.7}));
  grp.add(particles);

  grp.position.y = -0.4;

  /* ---- Interaction: mouse parallax + scroll rotation ---- */
  let mx=0, my=0, targX=0, targY=0;
  if(!reduced){
    window.addEventListener('mousemove', e=>{
      targX = (e.clientX/window.innerWidth - 0.5);
      targY = (e.clientY/window.innerHeight - 0.5);
    }, {passive:true});
  }

  let visible = true, running = true;
  const start = performance.now();
  function frame(now){
    const t = now - start;

    // Floors rise
    floors.forEach(f=>{
      const p = Math.min(Math.max((t - f.userData.delay - 400)/700, 0), 1);
      const e = 1 - Math.pow(1-p, 3);
      f.scale.set(e||0.001, e||0.001, e||0.001);
    });

    // Crane: hook lowers/raises the beam, beam sways, jib swings
    const lift = 3.4 + Math.sin(t/1600)*1.1;
    load.position.y = lift;
    load.rotation.z = Math.sin(t/1100)*0.12;
    load.rotation.y = Math.sin(t/1400)*0.2;
    cable.geometry.setFromPoints([new THREE.Vector3(4,6.4,0), new THREE.Vector3(4,lift+0.1,0)]);
    crane.rotation.y = Math.sin(t/5000)*0.35;

    // Beacon blink
    beacon.material.opacity = 0.35 + Math.abs(Math.sin(t/500))*0.65;

    // Grid pulse
    gridMat.opacity = 0.28 + Math.abs(Math.sin(t/2400))*0.14;

    // Particles drift upward and recycle
    const arr = pGeo.attributes.position.array;
    for(let i=0;i<P;i++){
      arr[i*3+1] += speed[i]*0.004;
      if(arr[i*3+1] > 8) arr[i*3+1] = 0;
    }
    pGeo.attributes.position.needsUpdate = true;

    // Scene rotation: slow base spin + scroll influence
    const scroll = window.scrollY || 0;
    grp.rotation.y = t/11000 + scroll*0.0012;

    // Camera parallax eases toward mouse
    mx += (targX - mx)*0.04;
    my += (targY - my)*0.04;
    camera.position.x = camBase.x + mx*1.4;
    camera.position.y = camBase.y - my*1.0;
    camera.lookAt(0, 2.6, 0);

    renderer.render(scene, camera);
    if(!reduced && visible){ requestAnimationFrame(frame); } else { running = false; }
  }

  if(reduced){
    floors.forEach(f=>f.scale.set(1,1,1));
    grp.rotation.y = 0.6;
    renderer.render(scene, camera);
  } else {
    requestAnimationFrame(frame);
  }

  if(!reduced && 'IntersectionObserver' in window){
    new IntersectionObserver(([en])=>{
      visible = en.isIntersecting;
      if(visible && !running){ running = true; requestAnimationFrame(frame); }
    }).observe(holder);
    document.addEventListener('visibilitychange', ()=>{
      visible = !document.hidden;
      if(visible && !running){ running = true; requestAnimationFrame(frame); }
    });
  }

  window.addEventListener('resize', ()=>{
    camera.aspect = holder.clientWidth/holder.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(holder.clientWidth, holder.clientHeight);
    if(reduced) renderer.render(scene, camera);
  });
})();
