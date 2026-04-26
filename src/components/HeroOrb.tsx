import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";

export const HeroOrb = () => (
  <Canvas camera={{ position: [0, 0, 5] }} className="!absolute inset-0">
    <ambientLight intensity={0.5} />
    <directionalLight position={[3, 3, 3]} intensity={1.2} />
    <pointLight position={[-3, -2, 2]} intensity={0.8} color="#a855f7" />
    <Float speed={1.5} rotationIntensity={1.2} floatIntensity={2}>
      <Sphere args={[1.6, 64, 64]}>
        <MeshDistortMaterial
          color="#1db954"
          distort={0.5}
          speed={2}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>
    </Float>
  </Canvas>
);
