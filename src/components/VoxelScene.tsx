import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { blockKind, truthyState } from "@shared/block-kind.ts";
import { colorForBlock } from "@shared/colors.ts";
import type { OccupiedCell } from "@shared/world.ts";
import { pickTex, useMcTextures } from "../useMcTextures.ts";

const PX = 1 / 16;

function shade(hex: string, mul: number): THREE.Color {
  const c = new THREE.Color(hex);
  c.multiplyScalar(mul);
  return c;
}

/** Minecraft-style face lighting: top 1.0, NS 0.8, EW 0.6, bottom 0.5 */
function mcBoxGeometry(w: number, h: number, d: number, hex: string): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const colors: number[] = [];
  const faceMul = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
  const pos = geo.getAttribute("position");
  for (let face = 0; face < 6; face++) {
    const c = shade(hex, faceMul[face]);
    for (let i = 0; i < 4; i++) {
      colors.push(c.r, c.g, c.b);
    }
  }
  if (pos.count !== colors.length / 3) {
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors.slice(0, pos.count * 3), 3));
  } else {
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
  return geo;
}

function solidMat(emissive = "#000000", intensity = 0, transparent = false, opacity = 1) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive,
    emissiveIntensity: intensity,
    transparent,
    opacity,
  });
}

function texMat(map: THREE.Texture, extra?: THREE.MeshLambertMaterialParameters) {
  return new THREE.MeshLambertMaterial({
    map,
    ...extra,
  });
}

function InstancedCubes({
  cells,
  fluid,
  map,
}: {
  cells: OccupiedCell[];
  fluid: boolean;
  map?: THREE.Texture;
}) {
  const color = colorForBlock(cells[0].name);
  const highlight = cells[0].fromCurrentGroup;
  const lava = cells[0].name === "minecraft:lava";
  const mesh = useMemo(() => {
    const geo = map ? new THREE.BoxGeometry(1, 1, 1) : mcBoxGeometry(1, 1, 1, color);
    const mat = map
      ? texMat(map, {
          emissive: highlight ? color : lava ? "#5a1800" : "#000000",
          emissiveIntensity: highlight ? 0.12 : lava ? 0.35 : 0,
          transparent: fluid,
          opacity: fluid ? 0.72 : 1,
        })
      : solidMat(
          highlight ? color : lava ? "#5a1800" : "#000000",
          highlight ? 0.2 : lava ? 0.4 : 0,
          fluid,
          fluid ? 0.72 : 1,
        );
    const inst = new THREE.InstancedMesh(geo, mat, cells.length);
    const dummy = new THREE.Object3D();
    cells.forEach((cell, i) => {
      dummy.position.set(cell.pos[0] + 0.5, cell.pos[1] + 0.5, cell.pos[2] + 0.5);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [cells, color, highlight, fluid, lava, map]);
  return <primitive object={mesh} />;
}

function TorchMesh({ cell }: { cell: OccupiedCell }) {
  const wall = blockKind(cell.name) === "wall_torch";
  const facing = String(cell.state.facing ?? "up");
  const soul = cell.name.includes("soul");
  const red = cell.name.includes("redstone");
  const flame = soul ? "#7ee8e0" : red ? "#ff3b2f" : "#ffd56a";
  const stick = "#6b4a22";
  const [x, y, z] = cell.pos;

  let px = x + 0.5;
  let py = y + 0.45;
  let pz = z + 0.5;
  let rotZ = 0;
  let rotX = 0;
  if (wall) {
    py = y + 0.5;
    if (facing === "north") {
      pz = z + 0.22;
      rotX = -0.55;
    } else if (facing === "south") {
      pz = z + 0.78;
      rotX = 0.55;
    } else if (facing === "west") {
      px = x + 0.22;
      rotZ = 0.55;
    } else {
      px = x + 0.78;
      rotZ = -0.55;
    }
  }

  return (
    <group position={[px, py, pz]} rotation={[rotX, 0, rotZ]}>
      <mesh position={[0, wall ? 0 : 0, 0]}>
        <primitive object={mcBoxGeometry(2 * PX, 10 * PX, 2 * PX, stick)} attach="geometry" />
        <primitive object={solidMat()} attach="material" />
      </mesh>
      <mesh position={[0, 6 * PX, 0]}>
        <boxGeometry args={[3.2 * PX, 3.2 * PX, 3.2 * PX]} />
        <meshLambertMaterial color={flame} emissive={flame} emissiveIntensity={1.1} />
      </mesh>
      <pointLight color={flame} intensity={0.55} distance={6} />
    </group>
  );
}

function FireMesh({ cell }: { cell: OccupiedCell }) {
  const [x, y, z] = cell.pos;
  const soul = cell.name.includes("soul");
  const col = soul ? "#6ad4d0" : "#ff7a1a";
  return (
    <group position={[x + 0.5, y + 0.45, z + 0.5]}>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshLambertMaterial color={col} emissive={col} emissiveIntensity={0.9} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshLambertMaterial color={col} emissive={col} emissiveIntensity={0.9} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function NetherPortalMesh({ cell, maps }: { cell: OccupiedCell; maps: Record<string, THREE.Texture> }) {
  const axis = String(cell.state.axis ?? "z");
  const [x, y, z] = cell.pos;
  const w = axis === "x" ? 4 * PX : 1;
  const d = axis === "x" ? 1 : 4 * PX;
  const map = pickTex(maps, "block/nether_portal.png");
  return (
    <mesh position={[x + 0.5, y + 0.5, z + 0.5]}>
      <boxGeometry args={[w, 1, d]} />
      {map ? (
        <meshLambertMaterial map={map} transparent opacity={0.88} emissive="#4a1ad4" emissiveIntensity={0.35} />
      ) : (
        <meshLambertMaterial color="#6b2cff" emissive="#4a1ad4" emissiveIntensity={0.7} transparent opacity={0.72} />
      )}
    </mesh>
  );
}

function EndPortalMesh({ cell, maps }: { cell: OccupiedCell; maps: Record<string, THREE.Texture> }) {
  const [x, y, z] = cell.pos;
  const map = pickTex(maps, "block/end_portal.png");
  return (
    <mesh position={[x + 0.5, y + 0.28, z + 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1, 1]} />
      {map ? (
        <meshLambertMaterial map={map} emissive="#2a0a4a" emissiveIntensity={0.45} />
      ) : (
        <meshLambertMaterial color="#0c0318" emissive="#3b1266" emissiveIntensity={0.85} />
      )}
    </mesh>
  );
}

function yawForFacing(facing: string): number {
  if (facing === "north") return 0;
  if (facing === "south") return Math.PI;
  if (facing === "west") return Math.PI / 2;
  return -Math.PI / 2;
}

function EndPortalFrameMesh({ cell, maps }: { cell: OccupiedCell; maps: Record<string, THREE.Texture> }) {
  const [x, y, z] = cell.pos;
  const facing = String(cell.state.facing ?? "south");
  const hasEye = truthyState(cell.state.eye);
  const stone = "#3a3224";
  const green = "#2f5c2a";
  const side = pickTex(maps, "block/end_portal_frame_side.png", "block/end_portal_frame.png");
  const top = pickTex(maps, "block/end_portal_frame_top.png", "block/end_portal_frame.png");
  const bottom = pickTex(maps, "block/end_stone.png", "block/end_portal_frame_top.png");
  const eyeBlock = pickTex(maps, "block/end_portal_frame_eye.png");
  const eyeItem = pickTex(maps, "item/ender_eye.png");

  const materials = useMemo(() => {
    if (!side && !top) return null;
    const sideMat = () => (side ? texMat(side) : new THREE.MeshLambertMaterial({ color: stone }));
    const topMat = top ? texMat(top) : new THREE.MeshLambertMaterial({ color: green });
    const bottomMat = bottom ? texMat(bottom) : new THREE.MeshLambertMaterial({ color: stone });
    return [sideMat(), sideMat(), topMat, bottomMat, sideMat(), sideMat()];
  }, [side, top, bottom, stone, green]);

  return (
    <group position={[x + 0.5, y, z + 0.5]} rotation={[0, yawForFacing(facing), 0]}>
      <mesh position={[0, 6.5 * PX, 0]}>
        {materials ? (
          <>
            <boxGeometry args={[1, 13 * PX, 1]} />
            {materials.map((m, i) => (
              <primitive key={i} object={m} attach={`material-${i}`} />
            ))}
          </>
        ) : (
          <>
            <primitive object={mcBoxGeometry(1, 13 * PX, 1, stone)} attach="geometry" />
            <primitive object={solidMat()} attach="material" />
          </>
        )}
      </mesh>
      {!hasEye && (
        <mesh position={[0, 11 * PX, 0]}>
          <boxGeometry args={[8 * PX, 4 * PX, 8 * PX]} />
          <meshLambertMaterial color="#1a140e" />
        </mesh>
      )}
      {hasEye && eyeBlock && (
        <mesh position={[0, 13.1 * PX, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10 * PX, 10 * PX]} />
          <meshLambertMaterial map={eyeBlock} transparent />
        </mesh>
      )}
      {hasEye && (
        <group position={[0, 15.5 * PX, 0]}>
          {eyeItem ? (
            <>
              <mesh rotation={[0, 0, 0]}>
                <planeGeometry args={[8 * PX, 8 * PX]} />
                <meshLambertMaterial map={eyeItem} transparent side={THREE.DoubleSide} />
              </mesh>
              <mesh rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[8 * PX, 8 * PX]} />
                <meshLambertMaterial map={eyeItem} transparent side={THREE.DoubleSide} />
              </mesh>
            </>
          ) : (
            <>
              <mesh>
                <sphereGeometry args={[3.2 * PX, 10, 8]} />
                <meshLambertMaterial color="#1c3d18" emissive={green} emissiveIntensity={0.45} />
              </mesh>
              <mesh position={[0, 0.4 * PX, 1.2 * PX]}>
                <sphereGeometry args={[1.1 * PX, 8, 6]} />
                <meshLambertMaterial color="#c9e86a" emissive="#7cff3a" emissiveIntensity={0.8} />
              </mesh>
            </>
          )}
        </group>
      )}
    </group>
  );
}

function Specials({ cells, maps }: { cells: OccupiedCell[]; maps: Record<string, THREE.Texture> }) {
  return (
    <>
      {cells.map((cell) => {
        const kind = blockKind(cell.name);
        const key = `${cell.pos.join(",")}:${cell.name}`;
        if (kind === "torch" || kind === "wall_torch") return <TorchMesh key={key} cell={cell} />;
        if (kind === "fire") return <FireMesh key={key} cell={cell} />;
        if (kind === "nether_portal") return <NetherPortalMesh key={key} cell={cell} maps={maps} />;
        if (kind === "end_portal") return <EndPortalMesh key={key} cell={cell} maps={maps} />;
        if (kind === "end_portal_frame") return <EndPortalFrameMesh key={key} cell={cell} maps={maps} />;
        return null;
      })}
    </>
  );
}

function World({ cells, maps }: { cells: OccupiedCell[]; maps: Record<string, THREE.Texture> }) {
  const { cubes, fluids, specials } = useMemo(() => {
    const cubes: OccupiedCell[] = [];
    const fluids: OccupiedCell[] = [];
    const specials: OccupiedCell[] = [];
    for (const cell of cells) {
      const kind = blockKind(cell.name);
      if (kind === "cube") cubes.push(cell);
      else if (kind === "fluid") fluids.push(cell);
      else specials.push(cell);
    }
    return { cubes, fluids, specials };
  }, [cells]);

  const cubeGroups = useMemo(() => {
    const map = new Map<string, OccupiedCell[]>();
    for (const cell of cubes) {
      const id = cell.name.replace(/^minecraft:/, "");
      const key = `${id}:${cell.fromCurrentGroup ? 1 : 0}`;
      const list = map.get(key) ?? [];
      list.push(cell);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [cubes]);

  const fluidGroups = useMemo(() => {
    const map = new Map<string, OccupiedCell[]>();
    for (const cell of fluids) {
      const key = `${cell.name}:${cell.fromCurrentGroup ? 1 : 0}`;
      const list = map.get(key) ?? [];
      list.push(cell);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [fluids]);

  return (
    <>
      {cubeGroups.map(([key, list]) => {
        const id = list[0].name.replace(/^minecraft:/, "");
        return <InstancedCubes key={key} cells={list} fluid={false} map={pickTex(maps, `block/${id}.png`)} />;
      })}
      {fluidGroups.map(([key, list]) => (
        <InstancedCubes key={`f-${key}`} cells={list} fluid />
      ))}
      <Specials cells={specials} maps={maps} />
    </>
  );
}

export default function VoxelScene({ cells }: { cells: OccupiedCell[] }) {
  const { maps, hint, available } = useMcTextures(cells);
  return (
    <div className="scene">
      <Canvas camera={{ position: [8, 6, 12], fov: 50 }}>
        <color attach="background" args={["#0e1014"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 18, 8]} intensity={1.2} />
        <hemisphereLight args={["#c8d6e5", "#3a3228", 0.35]} />
        <gridHelper args={[32, 32, "#3d3424", "#2a241c"]} position={[0, 0.001, 0]} />
        <World cells={cells} maps={maps} />
        <OrbitControls makeDefault target={[2, 2, 0]} />
      </Canvas>
      {!available && hint && <p className="scene-hint muted">{hint}</p>}
    </div>
  );
}
