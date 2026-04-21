import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json(
      { error: "Missing VAPID_PUBLIC_KEY env var. Generate VAPID keys and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY." },
      { status: 500 },
    )
  }
  return NextResponse.json({ publicKey })
}

