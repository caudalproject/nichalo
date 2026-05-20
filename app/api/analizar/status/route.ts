import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("id");

  if (!jobId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: job, error } = await supabase
    .from("analysis_jobs")
    .select("status, step_message, analysis_id, error_message")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status,
    step_message: job.step_message,
    analysis_id: job.analysis_id,
    error_message: job.error_message,
  });
}
