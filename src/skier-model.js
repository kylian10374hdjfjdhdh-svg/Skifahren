// Low-Poly-Skifahrer aus einfachen Formen.
const THREE = window.THREE;

const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const mat = (hex, rough = 0.6, metal = 0) =>
  new THREE.MeshStandardMaterial({ color: col(hex), roughness: rough, metalness: metal });

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function createSkier() {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const jacket = mat(0xe8381f, 0.55);
  const pants = mat(0x1c2433, 0.7);
  const helmetM = mat(0xf5f7fa, 0.3);
  const goggleM = mat(0x0b1220, 0.1, 0.6);
  const skiM = mat(0x1b1f2a, 0.35, 0.2);
  const accent = mat(0xffb020, 0.5);
  const glove = mat(0x222831, 0.8);

  // Skier
  for (const s of [-0.2, 0.2]) {
    rig.add(box(0.13, 0.05, 2.0, skiM, s, 0.03, 0));
    const tip = box(0.13, 0.05, 0.4, skiM, s, 0.09, -1.12);
    tip.rotation.x = 0.35;
    rig.add(tip);
    rig.add(box(0.05, 0.012, 1.3, accent, s, 0.062, 0.1));
  }

  const hips = new THREE.Group();
  hips.position.set(0, 0.1, 0);
  rig.add(hips);

  const legL = box(0.17, 0.6, 0.2, pants, -0.2, 0.32, 0);
  const legR = box(0.17, 0.6, 0.2, pants, 0.2, 0.32, 0);
  hips.add(legL, legR);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.62, 0);
  hips.add(torsoPivot);
  torsoPivot.add(box(0.52, 0.62, 0.32, jacket, 0, 0.31, 0));
  torsoPivot.add(box(0.54, 0.1, 0.34, accent, 0, 0.08, 0));

  const head = new THREE.Group();
  head.position.set(0, 0.8, -0.02);
  torsoPivot.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), helmetM);
  skull.castShadow = true;
  head.add(skull);
  head.add(box(0.31, 0.11, 0.1, goggleM, 0, 0.0, -0.15));

  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.31 * s, 0.55, 0);
    torsoPivot.add(arm);
    arm.add(box(0.12, 0.5, 0.13, jacket, 0, -0.22, 0));
    arm.add(box(0.13, 0.13, 0.14, glove, 0, -0.5, 0));
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.35, 5),
      mat(0x9aa4b2, 0.3, 0.6)
    );
    pole.position.set(0, -0.7, 0.45);
    pole.rotation.x = -0.6;
    pole.castShadow = true;
    arm.add(pole);
    arms.push(arm);
  }

  return { root, rig, hips, torsoPivot, head, arms, legs: [legL, legR], tuck: 0 };
}
