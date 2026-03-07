import { CreatureCard } from "@/components/creature-card";
import { getFeaturedCreatures } from "@/lib/catalog";
import { Reveal } from "@/components/reveal";

export async function HeroWall() {
  const creatures = await getFeaturedCreatures();

  return (
    <div className="hero-wall">
      {creatures.map((creature, index) => (
        <Reveal key={creature.id} delay={0.08 * index}>
          <CreatureCard creature={creature} />
        </Reveal>
      ))}
    </div>
  );
}
