import { Suspense } from "react";
import { QualityView } from "@/features/quality/quality-view";

export const metadata = { title: "Quality" };

export default function Page() {
  return (
    <Suspense>
      <QualityView />
    </Suspense>
  );
}
