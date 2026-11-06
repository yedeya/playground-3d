// One mesh per part, built from its triangles (in mm), with its edges as a child.
import * as THREE from 'three';
import type { Part } from '../domain/model.js';

/** A part's mesh: its part and its edges ride along in userData. */
export type PartMesh<P = Part> = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> & {
  userData: { part: P; edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial> };
};

export function partMesh<P extends Pick<Part, 'tri'>>(part: P): PartMesh<P> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.tri.map(v => v / 1000)), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 25),
    new THREE.LineBasicMaterial({ color: 0x1c2a2f, transparent: true, opacity: 0.45 }),
  );
  mesh.add(edges);
  mesh.userData = { part, edges };
  // three.js types userData as Record<string, any>; the line above gives it exactly the PartMesh shape.
  return mesh as PartMesh<P>;
}
