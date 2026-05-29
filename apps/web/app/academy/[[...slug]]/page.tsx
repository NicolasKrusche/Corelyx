import { redirect } from "next/navigation";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function AcademyLegacyPage({ params }: Props) {
  const { slug = [] } = await params;
  redirect(slug.length > 0 ? `/guides/${slug.join("/")}` : "/guides");
}
