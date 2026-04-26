import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere, Stars, Torus, Icosahedron } from "@react-three/drei";

export const HeroOrb = () => (
  <Canvas camera={{ position: [0, 0, 5] }} className="!absolute inset-0">
    <ambientLight intensity={0.9} />
    <directionalLight position={[3, 3, 3]} intensity={1.6} />
    <pointLight position={[-3, -2, 2]} intensity={1.4} color="#a855f7" />
    <pointLight position={[3, 2, -2]} intensity={1.2} color="#22d3ee" />
    <pointLight position={[0, 3, 2]} intensity={1} color="#f0abfc" />

    <Stars radius={50} depth={30} count={1500} factor={3} fade speed={1} />

    {/* Main central orb */}
    <Float speed={1.5} rotationIntensity={1.2} floatIntensity={2}>
      <Sphere args={[1.5, 64, 64]} position={[0, 0, 0]}>
        <MeshDistortMaterial
          color="#1db954"
          distort={0.55}
          speed={2.2}
          roughness={0.15}
          metalness={0.85}
        />
      </Sphere>
    </Float>

    {/* Floating accent shapes */}
    <Float speed={2} rotationIntensity={2} floatIntensity={2.5}>
      <Icosahedron args={[0.45, 0]} position={[-2.6, 1.4, -1]}>
        <meshStandardMaterial color="#f0abfc" metalness={0.9} roughness={0.1} />
      </Icosahedron>
    </Float>

    <Float speed={1.8} rotationIntensity={1.5} floatIntensity={2}>
      <Torus args={[0.4, 0.14, 24, 60]} position={[2.6, -1.2, -0.5]}>
        <meshStandardMaterial color="#22d3ee" metalness={0.85} roughness={0.2} />
      </Torus>
    </Float>

    <Float speed={2.4} rotationIntensity={1.8} floatIntensity={3}>
      <Sphere args={[0.3, 32, 32]} position={[2.2, 1.6, -1.5]}>
        <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.5} />
      </Sphere>
    </Float>

    <Float speed={1.6} rotationIntensity={2.2} floatIntensity={2.2}>
      <Icosahedron args={[0.32, 0]} position={[-2.3, -1.5, -1]}>
        <meshStandardMaterial color="#fb7185" metalness={0.7} roughness={0.25} />
      </Icosahedron>
    </Float>
  </Canvas>
);
