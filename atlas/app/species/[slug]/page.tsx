import { notFound } from "next/navigation";
import { TaxonTemplate } from "@/components/taxon-template";
import { getCatalog, getTaxon } from "@/lib/catalog";

type SpeciesPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const catalog = await getCatalog();
  return catalog.taxa.filter((taxon) => taxon.level === "species").map((taxon) => ({ slug: taxon.slug }));
}

export default async function SpeciesPage({ params }: SpeciesPageProps) {
  const { slug } = await params;
  if (!(await getTaxon("species", slug))) {
    notFound();
  }
  return <TaxonTemplate level="species" slug={slug} />;
}
