import { buildRows, toCsv } from "@/lib/export";
import { exportBundle, getFactorLabels, getVehicle, getViewer, logExport } from "@/lib/gate";

// GET /api/export?vehicle=G70&format=csv|json
// The requirement list in BMW's format, limited to what the viewer's region may see. Every export is logged.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vehicle = url.searchParams.get("vehicle") ?? "";
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const v = await getVehicle(vehicle);
  if (!v) return Response.json({ ok: false, error: "Unknown vehicle." }, { status: 404 });

  const viewer = await getViewer();
  const [bundle, labels] = await Promise.all([exportBundle(viewer, vehicle), getFactorLabels()]);
  const rows = buildRows(bundle, labels);
  await logExport(viewer, vehicle, format, rows.length);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `pmw-requirements-${vehicle}-${viewer.region}-${stamp}.${format}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
  if (format === "json") {
    const body = {
      vehicle: v.name,
      region: viewer.label,
      exported_by: viewer.actor,
      exported_at: new Date().toISOString(),
      note: "Customer comment text from markets outside the viewer's region is restricted.",
      count: rows.length,
      requirements: rows,
    };
    return new Response(JSON.stringify(body, null, 2), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  }
  return new Response(toCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
