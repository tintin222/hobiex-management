import { Suspense } from "react";
import { OperatorView } from "@/features/operator/operator-view";

export const metadata = { title: "Operator terminal" };

export default function Page() {
  return (
    <Suspense>
      <OperatorView />
    </Suspense>
  );
}
