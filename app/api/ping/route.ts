import { NextResponse } from "next/server";
export async function GET() {
  return new NextResponse("app-router-api-ok", { status: 200 });
}
