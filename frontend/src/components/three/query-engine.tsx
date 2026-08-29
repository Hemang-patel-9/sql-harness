"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

/**
 * The scene is drawn from the same tokens as the rest of the interface.
 * They are repeated here as hex because a WebGL material cannot read a CSS
 * custom property — if `globals.css` moves, move these with it.
 */
interface Palette {
  solid: string;
  edge: string;
  edgeQuiet: string;
  marker: string;
  ring: string;
  key: string;
  fill: string;
  ambient: number;
  keyIntensity: number;
}

const PALETTE: Record<"light" | "dark", Palette> = {
  light: {
    solid: "#ffffff",
    edge: "#aab7c4",
    edgeQuiet: "#cbd4de",
    marker: "#d98800",
    ring: "#c6d0db",
    key: "#ffffff",
    fill: "#dfe5ec",
    ambient: 1.05,
    keyIntensity: 2.1,
  },
  dark: {
    solid: "#1a222b",
    edge: "#4e5b69",
    edgeQuiet: "#2f3a45",
    marker: "#f0b13c",
    ring: "#2c3742",
    key: "#dfe8f2",
    fill: "#1a222b",
    ambient: 0.75,
    keyIntensity: 1.5,
  },
};

/* ------------------------------------------------------------------ */
/* Layout — where the tables sit around the core                        */
/* ------------------------------------------------------------------ */

interface TableNode {
  name: string;
  position: [number, number, number];
  /** Plate footprint; wider plates read as wider tables. */
  size: [number, number];
}

const NODES: TableNode[] = [
  { name: "orders", position: [2.75, 0.62, 0.35], size: [1.15, 0.78] },
  { name: "customers", position: [-2.6, 1.05, 0.6], size: [1.25, 0.72] },
  { name: "line_items", position: [1.6, -1.25, 2.05], size: [1.05, 0.7] },
  { name: "refunds", position: [-2.1, -1.15, -1.5], size: [0.9, 0.62] },
  { name: "products", position: [0.55, 1.55, -2.5], size: [1.1, 0.7] },
  { name: "sessions", position: [2.35, -0.35, -2.15], size: [0.95, 0.66] },
];

/** One curve per join, bowed so no line runs through the core. */
function buildCurves(): THREE.QuadraticBezierCurve3[] {
  return NODES.map((node) => {
    const end = new THREE.Vector3(...node.position);
    const mid = end.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0.55, 0));
    return new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), mid, end);
  });
}

/**
 * r3f has no stable lowercase element for lines, so they go in as primitives
 * — which means owning their disposal too.
 */
function useDisposeLines(lines: THREE.Line[]) {
  useEffect(() => {
    return () => {
      for (const line of lines) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    };
  }, [lines]);
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** The stacked discs everyone already reads as "database". */
function Core({ palette }: { palette: Palette }) {
  const disc = useMemo(() => new THREE.CylinderGeometry(1.02, 1.02, 0.24, 56), []);
  const rims = useMemo(() => new THREE.EdgesGeometry(disc, 25), [disc]);

  useEffect(() => {
    return () => {
      disc.dispose();
      rims.dispose();
    };
  }, [disc, rims]);

  return (
    <group>
      {[-0.42, 0, 0.42].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh geometry={disc}>
            <meshStandardMaterial
              color={palette.solid}
              roughness={0.62}
              metalness={0.04}
            />
          </mesh>
          <lineSegments geometry={rims}>
            <lineBasicMaterial color={palette.edge} transparent opacity={0.9} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

/** A table: a thin plate, marked with the amber caret when it is the one. */
function Plate({
  node,
  palette,
  active,
}: {
  node: TableNode;
  palette: Palette;
  active: boolean;
}) {
  const [width, depth] = node.size;

  const box = useMemo(
    () => new THREE.BoxGeometry(width, 0.1, depth),
    [width, depth],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);

  useEffect(() => {
    return () => {
      box.dispose();
      edges.dispose();
    };
  }, [box, edges]);

  return (
    <group position={node.position}>
      <mesh geometry={box}>
        <meshStandardMaterial color={palette.solid} roughness={0.7} metalness={0} />
      </mesh>

      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={active ? palette.marker : palette.edge}
          transparent
          opacity={active ? 1 : 0.85}
        />
      </lineSegments>

      {active && (
        <mesh position={[-width / 2 + 0.07, 0.076, 0]}>
          <boxGeometry args={[0.08, 0.03, depth * 0.72]} />
          <meshBasicMaterial color={palette.marker} />
        </mesh>
      )}
    </group>
  );
}

/** The joins, drawn as quiet curves out from the core. */
function Joins({
  curves,
  palette,
}: {
  curves: THREE.QuadraticBezierCurve3[];
  palette: Palette;
}) {
  const lines = useMemo(
    () =>
      curves.map(
        (curve) =>
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(curve.getPoints(44)),
            new THREE.LineBasicMaterial({
              color: palette.edgeQuiet,
              transparent: true,
              opacity: 0.85,
            }),
          ),
      ),
    [curves, palette.edgeQuiet],
  );
  useDisposeLines(lines);

  return (
    <group>
      {lines.map((line, index) => (
        <primitive key={index} object={line} />
      ))}
    </group>
  );
}

/** Two flat rings under the core, to seat the object in space. */
function Rings({ palette }: { palette: Palette }) {
  const lines = useMemo(
    () =>
      [2.05, 3.15].map((radius) => {
        const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
        const geometry = new THREE.BufferGeometry().setFromPoints(
          curve.getPoints(96).map((p: THREE.Vector2) => new THREE.Vector3(p.x, 0, p.y)),
        );
        return new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: palette.ring,
            transparent: true,
            opacity: 0.6,
          }),
        );
      }),
    [palette.ring],
  );
  useDisposeLines(lines);

  return (
    <group position={[0, -1.9, 0]}>
      {lines.map((line, index) => (
        <primitive key={index} object={line} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const HOP_SECONDS = 1.75;
const RESTING_TILT: [number, number, number] = [0.16, 0.5, 0];

function Scene({ palette, animate }: { palette: Palette; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const signal = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const [active, setActive] = useState(0);

  const curves = useMemo(() => buildCurves(), []);

  useFrame((state, delta) => {
    if (!animate || !group.current) return;

    elapsed.current += delta;

    // The assembly turns, slowly enough to read the shapes.
    group.current.rotation.y += delta * 0.14;

    // …and leans towards the pointer, so it reads as held, not played.
    const targetX = RESTING_TILT[0] - state.pointer.y * 0.18;
    const targetZ = state.pointer.x * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.05;
    group.current.rotation.z += (targetZ - group.current.rotation.z) * 0.05;

    // One query travelling out to one table at a time.
    const index = Math.floor(elapsed.current / HOP_SECONDS) % curves.length;
    if (index !== active) setActive(index);

    if (signal.current) {
      // Ease out over the first two thirds, then hold at the table.
      const t = Math.min(1, (elapsed.current % HOP_SECONDS) / HOP_SECONDS / 0.66);
      signal.current.position.copy(curves[index].getPoint(1 - Math.pow(1 - t, 3)));
    }
  });

  return (
    <group ref={group} rotation={RESTING_TILT}>
      <Rings palette={palette} />
      <Joins curves={curves} palette={palette} />
      <Core palette={palette} />

      {NODES.map((node, index) => (
        <Plate
          key={node.name}
          node={node}
          palette={palette}
          active={animate && index === active}
        />
      ))}

      <mesh ref={signal} visible={animate}>
        <sphereGeometry args={[0.088, 20, 20]} />
        <meshBasicMaterial color={palette.marker} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

/**
 * The one genuinely three-dimensional thing in the product: the schema as
 * an object you can see around, with a query running out to one table at a
 * time. It is decorative — client-only, never blocking the hero copy, and
 * it holds perfectly still for anyone who asks it to.
 */
export default function QueryEngine({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const reduced = useReducedMotion() ?? false;
  const palette = PALETTE[resolvedTheme === "dark" ? "dark" : "light"];

  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={reduced ? "demand" : "always"}
        camera={{ position: [0.4, 2.3, 6.6], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={palette.ambient} />
        <directionalLight
          position={[4, 6, 3]}
          intensity={palette.keyIntensity}
          color={palette.key}
        />
        <directionalLight position={[-5, -2, -4]} intensity={0.6} color={palette.fill} />

        <Scene palette={palette} animate={!reduced} />
      </Canvas>
    </div>
  );
}
