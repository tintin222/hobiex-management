import { Suspense } from "react";
import { TaskBoardView } from "@/features/tasks/task-board-view";

export const metadata = { title: "Task board" };

export default function Page() {
  return (
    <Suspense>
      <TaskBoardView />
    </Suspense>
  );
}
