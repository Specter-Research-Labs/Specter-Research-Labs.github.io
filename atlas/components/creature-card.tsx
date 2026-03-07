import Link from "next/link";
import type { CreatureRecord } from "@/data/catalog";
import { SpecimenStage } from "@/components/specimen-stage";

type CreatureCardProps = {
  creature: CreatureRecord;
};

export function CreatureCard({ creature }: CreatureCardProps) {
  return (
    <Link href={`/creature/${creature.slug}`} className="creature-card">
      <SpecimenStage creature={creature} compact />
      <div className="creature-card-copy">
        <span className="creature-card-kicker">{creature.epithet}</span>
        <strong>{creature.name}</strong>
        <p>{creature.tagline}</p>
      </div>
    </Link>
  );
}
