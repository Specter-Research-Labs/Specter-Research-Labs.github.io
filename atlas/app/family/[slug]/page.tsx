import { notFound } from "next/navigation";
import { TaxonTemplate } from "@/components/taxon-template";
import { getCatalog, getTaxon } from "@/lib/catalog";

type FamilyPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const catalog = await getCatalog();
  return catalog.taxa.filter((taxon) => taxon.level === "family").map((taxon) => ({ slug: taxon.slug }));
}

export default async function FamilyPage({ params }: FamilyPageProps) {
  const { slug } = await params;
  if (!(await getTaxon("family", slug))) {
    notFound();
  }
  return <TaxonTemplate level="family" slug={slug} />;
}
