import { redirect } from "next/navigation";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function GuidesRedirect({ params }: Props) {
  const { slug = [] } = await params;
  redirect(slug.length > 0 ? `/docs/${slug.join("/")}` : "/docs");
}
