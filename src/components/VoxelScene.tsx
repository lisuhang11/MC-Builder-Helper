import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { colorForBlock } from "@shared/colors.ts";
import type { OccupiedCell } from "@shared/world.ts";

function Cubes({ cells }: { cells: OccupiedCell[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, OccupiedCell[]>();
    for (const cell of cells) {
      const color = colorForBlock(cell.name);
      const fluid = cell.name === "minecraft:nether_portal" || cell.name === "minecraft:water" || cell.name === "minecraft:lava";
      const key = `${color}:${cell.fromCurrentGroup ? "1" : "0"}:${fluid ? "f" : "s"}`;
      const list = map.get(key) ?? [];
      list.push(cell);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [cells]);

  return (
    <>
      {groups.map(([key, list]) => (
        <InstancedCubes key={key} cells={list} />
      ))}
    </>
  );
}

function InstancedCubes({ cells }: { cells: OccupiedCell[] }) {
  const color = colorForBlock(cells[0].name);
  const highlight = cells[0].fromCurrentGroup;
  const fluid =
    cells[0].name === "minecraft:nether_portal" ||
    cells[0].name === "minecraft:water" ||
    cells[0].name === "minecraft:lava";
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: highlight ? color : cells[0].name === "minecraft:lava" ? "#5a1800" : "#000000",
      emissiveIntensity: highlight ? 0.22 : cells[0].name === "minecraft:lava" ? 0.35 : 0,
      transparent: fluid,
      opacity: fluid ? 0.78 : 1,
      roughness: 0.85,
      metalness: 0.02,
    });
    const inst = new THREE.InstancedMesh(geo, mat, cells.length);
    const dummy = new THREE.Object3D();
    cells.forEach((cell, i) => {
      dummy.position.set(cell.pos[0] + 0.5, cell.pos[1] + 0.5, cell.pos[2] + 0.5);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [cells, color, highlight, fluid]);

  return <primitive object={mesh} />;
}

export default function VoxelScene({ cells }: { cells: OccupiedCell[] }) {
  return (
    <div className="scene">
      <Canvas camera={{ position: [8, 6, 12], fov: 50 }} shadows>
        <color attach="background" args={["#0e1014"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 14, 6]} intensity={1.1} />
        <gridHelper args={[32, 32, "#3d3424", "#2a241c"]} position={[0, 0.001, 0]} />
        <axesHelper args={[3]} />
        <Cubes cells={cells} />
        <OrbitControls makeDefault target={[2, 2, 0]} />
      </Canvas>
    </div>
  );
}
