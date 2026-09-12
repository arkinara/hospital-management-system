"use client";

import DoctorAvailabilityScreen from "@/components/schedule/DoctorAvailabilityScreen";

export default function DoctorAvailabilityPage({
  params,
}: {
  params: { id: string };
}) {
  return <DoctorAvailabilityScreen doctorId={Number(params.id)} />;
}