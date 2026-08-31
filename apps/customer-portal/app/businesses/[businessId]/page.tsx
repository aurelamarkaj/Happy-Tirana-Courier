import { BusinessDetail } from "../../../components/business-detail";

export default async function BusinessPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;

  return <BusinessDetail businessId={businessId} />;
}
