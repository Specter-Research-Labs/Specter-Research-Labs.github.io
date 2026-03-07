import { notFound } from "next/navigation";
import { TaxonTemplate } from "@/components/taxon-template";
import { getCatalog, getTaxon } from "@/lib/catalog";

type GenusPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const catalog = await getCatalog();
  return catalog.taxa.filter((taxon) => taxon.level === "genus").map((taxon) => ({ slug: taxon.slug }));
}

export default async function GenusPage({ params }: GenusPageProps) {
  const { slug } = await params;
  if (!(await getTaxon("genus", slug))) {
    notFound();
  }
  return <TaxonTemplate level="genus" slug={slug} />;
}
