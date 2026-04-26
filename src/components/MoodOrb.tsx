import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";

interface MoodOrbProps {
  color: string;
  isActive?: boolean;
}

export const MoodOrb = ({ color, isActive }: MoodOrbProps) => (
  <Canvas camera={{ position: [0, 0, 4] }} className="!absolute inset-0 pointer-events-none">
    <ambientLight intensity={0.6} />
    <directionalLight position={[2, 2, 2]} intensity={1} />
    <Float speed={isActive ? 3 : 1.5} rotationIntensity={1} floatIntensity={1.5}>
      <Sphere args={[1.2, 32, 32]}>
        <MeshDistortMaterial
          color={color}
          distort={isActive ? 0.6 : 0.35}
          speed={isActive ? 3 : 1.5}
          roughness={0.3}
          metalness={0.7}
        />
      </Sphere>
    </Float>
  </Canvas>
);
