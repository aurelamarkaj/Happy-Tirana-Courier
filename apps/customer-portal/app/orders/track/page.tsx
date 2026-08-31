import { OrderTrack } from "../../../components/order-track";

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ orderCode?: string }> }) {
  const params = await searchParams;
  return <OrderTrack initialCode={params.orderCode ?? ""} />;
}
