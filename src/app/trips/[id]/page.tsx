import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "@/lib/server/auth";
import { getTrip } from "@/lib/server/store";
import { AppError } from "@/lib/server/errors";
import TripView from "@/components/trip-view";
export const dynamic = "force-dynamic";
export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  try {
    return <TripView initial={await getTrip(user.id, id)} />;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
