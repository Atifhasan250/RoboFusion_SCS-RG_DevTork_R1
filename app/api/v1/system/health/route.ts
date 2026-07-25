import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ status: "healthy", service: "scs-rg", timestamp: new Date().toISOString() }); }
