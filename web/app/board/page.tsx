import { BoardWorkspace } from "@/components/BoardWorkspace";
import { getViewer } from "@/lib/gate";

export const dynamic = "force-dynamic";

/** Requirements board across every vehicle the viewer may access (Vishwa's decision workspace). */
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  return (
    <main className="flex-1 bg-white">
      <div className="container-x py-8">
        <BoardWorkspace sp={sp} viewer={viewer} basePath="/board" fixedVehicle={null} heading="h1" />
      </div>
    </main>
  );
}
