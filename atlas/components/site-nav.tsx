import Link from "next/link";
import { getCatalog } from "@/lib/catalog";

export async function SiteNav() {
  const { navigation } = await getCatalog();

  return (
    <header className="atlas-nav">
      <Link href="/" className="atlas-wordmark">
        Lenia Atlas
      </Link>
      <nav className="atlas-pill-row" aria-label="Atlas navigation">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} className="atlas-pill">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
