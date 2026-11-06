// One mesh per part, on the part's own geometry from the GLB (in metres, unindexed), with its edges as a child.
import * as THREE from 'three';
import type { ModelPart } from '../domain/model';
import type { LoadedModel } from '../data/load-model';

/** A part's mesh: its part and its edges ride along in userData. */
export type PartMesh<P = ModelPart> = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> & {
  userData: { part: P; edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial> };
};

/**
 * The part's mesh on `geometry`, which must be unindexed: its normals are then one per triangle, so every plank keeps
 * its sharp corners, and its edges are drawn where faces meet at more than 25°.
 */
export function partMesh<P>(part: P, geometry: THREE.BufferGeometry): PartMesh<P> {
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

/** Every part's mesh, in the model's order. */
export const partMeshes = (model: LoadedModel): PartMesh[] =>
  model.parts.map((part, i) => partMesh(part, model.geometries[i]!));
