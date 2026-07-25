import Link from "next/link";
import { SITE_URL } from "@/lib/seo/content";

export type BreadcrumbItem = {
  name: string;
  href: string;
};

/**
 * Build a breadcrumb trail from a path string.
 * "/blog/my-post" → [{name: "Home", href: "/"}, {name: "Blog", href: "/blog"}, {name: "My Post", href: "/blog/my-post"}]
 */
export function buildBreadcrumbItems(path: string, overrideLastLabel?: string): BreadcrumbItem[] {
  const parts = path.split("/").filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ name: "Home", href: "/" }];
  let current = "";

  for (const part of parts) {
    current += `/${part}`;
    const label = part
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    crumbs.push({ name: label, href: current });
  }

  if (overrideLastLabel && crumbs.length > 1) {
    crumbs[crumbs.length - 1].name = overrideLastLabel;
  }

  return crumbs;
}

/**
 * JSON-LD BreadcrumbList schema for structured data.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.href}`,
    })),
  };
}

type BreadcrumbNavProps = {
  items: BreadcrumbItem[];
  className?: string;
};

/**
 * Visual breadcrumb navigation with schema.org BreadcrumbList markup.
 */
export function BreadcrumbNav({ items, className }: BreadcrumbNavProps) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd(items)) }}
      />
      <nav
        aria-label="Breadcrumb"
        className={className ?? "mb-8 text-xs text-muted-foreground"}
      >
        <ol className="flex flex-wrap items-center gap-2">
          {items.map((crumb, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden="true">/</span>}
                {isLast ? (
                  <span className="text-foreground" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  <Link href={crumb.href} className="hover:text-foreground">
                    {crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
